/**
 * Polymarket Netflix Markets API
 *
 * Dynamically fetches current week's Netflix prediction markets from Polymarket.
 * Markets update every Tuesday at 12pm EST.
 *
 * Event IDs are not sequential - they're unique IDs that vary by week.
 * This API scans a range of possible IDs to find active markets.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Known Netflix market slug patterns - the number suffix changes weekly
// Note: "US" = English content, "Global" = Non-English content
const MARKET_PATTERNS = [
  // US Shows (English)
  { basePattern: 'what-will-be-the-top-us-netflix-show-this-week', category: 'shows-english', rank: 1, label: '#1 US TV Show' },
  { basePattern: 'what-will-be-the-2-us-netflix-show-this-week', category: 'shows-english', rank: 2, label: '#2 US TV Show' },

  // Global Shows (Non-English)
  { basePattern: 'what-will-be-the-top-global-netflix-show-this-week', category: 'shows-non-english', rank: 1, label: '#1 Global TV Show' },
  { basePattern: 'what-will-be-the-2-global-netflix-show-this-week', category: 'shows-non-english', rank: 2, label: '#2 Global TV Show' },

  // US Movies (English)
  { basePattern: 'what-will-be-the-top-us-netflix-movie-this-week', category: 'films-english', rank: 1, label: '#1 US Movie' },
  { basePattern: 'what-will-be-the-2-us-netflix-movie-this-week', category: 'films-english', rank: 2, label: '#2 US Movie' },

  // Global Movies (Non-English)
  { basePattern: 'what-will-be-the-top-global-netflix-movie-this-week', category: 'films-non-english', rank: 1, label: '#1 Global Movie' },
  { basePattern: 'what-will-be-the-2-global-netflix-movie-this-week', category: 'films-non-english', rank: 2, label: '#2 Global Movie' },
];

// Auto-discovery settings - scan wider ranges to find current week's markets
// Market IDs increment each week, so we need to scan higher ranges over time
const HOT_RANGES: Record<string, { start: number; end: number }> = {
  'shows': { start: 450, end: 800 },  // Shows - expanded range
  'movies': { start: 850, end: 1200 }, // Movies - expanded range
};
const EXTENDED_RANGE = { start: 400, end: 1500 }; // Fallback full range - expanded
const SCAN_BATCH_SIZE = 50; // Check 50 IDs in parallel per batch for faster scanning

interface PolymarketMarket {
  id: string;
  question: string;
  groupItemTitle: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volumeNum: number;
  active: boolean;
}

interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  closed: boolean;
  volume: number;
  markets: PolymarketMarket[];
}

interface ParsedOutcome {
  name: string;
  probability: number;
  volume: number;
}

interface ParsedMarket {
  slug: string;
  label: string;
  question: string;
  category: string;
  rank: number;
  outcomes: ParsedOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

// Cache for discovered market IDs to avoid rescanning
const marketIdCache: Map<string, { id: number; timestamp: number }> = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes - refresh more often to catch new markets

async function fetchEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) return null;

    const events: PolymarketEvent[] = await response.json();

    if (events.length === 0) return null;

    const event = events[0];

    // Return if has markets (allow closed markets - they still have valid data until resolved)
    // Netflix markets close on Tuesdays when betting ends but data is still relevant
    if (event.markets?.length > 0) {
      return event;
    }

    return null;
  } catch {
    return null;
  }
}

async function scanRange(
  basePattern: string,
  rangeStart: number,
  rangeEnd: number
): Promise<{ id: number; closed: boolean } | null> {
  const foundMarkets: { id: number; closed: boolean }[] = [];

  // Scan from high to low (newer markets have higher IDs)
  for (let start = rangeEnd; start >= rangeStart; start -= SCAN_BATCH_SIZE) {
    const batch: number[] = [];
    for (let id = start; id > Math.max(start - SCAN_BATCH_SIZE, rangeStart - 1); id--) {
      batch.push(id);
    }

    const results = await Promise.all(
      batch.map(async (id) => {
        const slug = `${basePattern}-${id}`;
        const event = await fetchEventBySlug(slug);
        return event ? { id, event } : null;
      })
    );

    for (const result of results) {
      if (result) {
        foundMarkets.push({ id: result.id, closed: result.event.closed });

        // If we found an ACTIVE market, return immediately
        if (!result.event.closed) {
          return { id: result.id, closed: false };
        }
      }
    }
  }

  // Return most recent closed market if no active found
  if (foundMarkets.length > 0) {
    foundMarkets.sort((a, b) => b.id - a.id);
    return foundMarkets[0];
  }

  return null;
}

async function findActiveMarketId(basePattern: string): Promise<number | null> {
  // Check cache first (only use cache for active markets)
  const cached = marketIdCache.get(basePattern);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Verify cached market is still active
    const slug = cached.id === 0 ? basePattern : `${basePattern}-${cached.id}`;
    const event = await fetchEventBySlug(slug);
    if (event && !event.closed) {
      return cached.id;
    }
    // Cache is stale (market closed), clear it
    marketIdCache.delete(basePattern);
  }

  // Try without suffix first (might be a market without ID suffix)
  const eventNoSuffix = await fetchEventBySlug(basePattern);
  if (eventNoSuffix && !eventNoSuffix.closed) {
    marketIdCache.set(basePattern, { id: 0, timestamp: Date.now() });
    return 0;
  }

  // Determine category from pattern (shows vs movies)
  const isMovie = basePattern.includes('movie');
  const hotRange = isMovie ? HOT_RANGES['movies'] : HOT_RANGES['shows'];

  // Track best closed market as fallback
  let bestClosedMarket: { id: number; closed: boolean } | null = null;

  // Step 1: Check hot range first (most likely to find current week's market)
  const hotResult = await scanRange(basePattern, hotRange.start, hotRange.end);
  if (hotResult && !hotResult.closed) {
    marketIdCache.set(basePattern, { id: hotResult.id, timestamp: Date.now() });
    return hotResult.id;
  }
  if (hotResult) {
    bestClosedMarket = hotResult;
  }

  // Step 2: Check above hot range (newer markets have higher IDs)
  if (hotRange.end < EXTENDED_RANGE.end) {
    const aboveResult = await scanRange(basePattern, hotRange.end + 1, EXTENDED_RANGE.end);
    if (aboveResult && !aboveResult.closed) {
      marketIdCache.set(basePattern, { id: aboveResult.id, timestamp: Date.now() });
      return aboveResult.id;
    }
    if (aboveResult && (!bestClosedMarket || aboveResult.id > bestClosedMarket.id)) {
      bestClosedMarket = aboveResult;
    }
  }

  // Step 3: Check below hot range
  if (hotRange.start > EXTENDED_RANGE.start) {
    const belowResult = await scanRange(basePattern, EXTENDED_RANGE.start, hotRange.start - 1);
    if (belowResult && !belowResult.closed) {
      marketIdCache.set(basePattern, { id: belowResult.id, timestamp: Date.now() });
      return belowResult.id;
    }
    if (belowResult && (!bestClosedMarket || belowResult.id > bestClosedMarket.id)) {
      bestClosedMarket = belowResult;
    }
  }

  // No active market found - use most recent closed market (highest ID = most recent)
  // Don't cache closed markets - we want to keep checking for active ones
  if (bestClosedMarket) {
    return bestClosedMarket.id;
  }

  // Fall back to no-suffix market even if closed
  if (eventNoSuffix) {
    return 0;
  }

  return null;
}

async function fetchMarketByPattern(basePattern: string): Promise<PolymarketEvent | null> {
  try {
    const marketId = await findActiveMarketId(basePattern);

    if (marketId === null) return null;

    const slug = marketId === 0 ? basePattern : `${basePattern}-${marketId}`;
    return await fetchEventBySlug(slug);
  } catch (error) {
    console.error(`Error fetching market for pattern ${basePattern}:`, error);
    return null;
  }
}

function parseMarketOutcomes(event: PolymarketEvent): ParsedOutcome[] {
  const outcomes: ParsedOutcome[] = [];

  if (!event.markets) return outcomes;

  for (const market of event.markets) {
    // Skip inactive or placeholder markets
    if (!market.active || market.groupItemTitle?.includes('Show ') || market.groupItemTitle?.includes('Movie ')) {
      continue;
    }

    try {
      const prices = JSON.parse(market.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0]) || 0;

      // Only include if there's a meaningful probability
      if (yesPrice > 0.0001) {
        outcomes.push({
          name: market.groupItemTitle || 'Unknown',
          probability: yesPrice,
          volume: market.volumeNum || 0,
        });
      }
    } catch {
      // Skip malformed data
    }
  }

  // Sort by probability descending
  outcomes.sort((a, b) => b.probability - a.probability);

  return outcomes;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tab = searchParams.get('tab');
    const refresh = searchParams.get('refresh') === 'true';

    // Clear cache if refresh requested
    if (refresh) {
      marketIdCache.clear();
    }

    // Filter patterns by category if tab is provided
    const patternsToFetch = tab
      ? MARKET_PATTERNS.filter(p => p.category === tab)
      : MARKET_PATTERNS;

    // Fetch all matching markets in parallel
    const marketPromises = patternsToFetch.map(async (config) => {
      const event = await fetchMarketByPattern(config.basePattern);

      if (!event) return null;

      const outcomes = parseMarketOutcomes(event);

      if (outcomes.length === 0) return null;

      return {
        slug: event.slug,
        label: config.label,
        question: event.title,
        category: config.category,
        rank: config.rank,
        outcomes,
        totalVolume: event.volume || 0,
        polymarketUrl: `https://polymarket.com/event/${event.slug}`,
      } as ParsedMarket;
    });

    const results = await Promise.all(marketPromises);
    const markets = results.filter((m): m is ParsedMarket => m !== null);

    // Group by category if no specific tab requested
    if (!tab) {
      const grouped: Record<string, ParsedMarket[]> = {
        'shows-english': [],
        'shows-non-english': [],
        'films-english': [],
        'films-non-english': [],
      };

      for (const market of markets) {
        if (grouped[market.category]) {
          grouped[market.category].push(market);
        }
      }

      // Sort each category by rank
      for (const category of Object.keys(grouped)) {
        grouped[category].sort((a, b) => a.rank - b.rank);
      }

      return NextResponse.json({
        success: true,
        data: grouped,
        meta: {
          totalMarkets: markets.length,
          fetchedAt: new Date().toISOString(),
        },
      });
    }

    // Sort by rank for specific tab
    markets.sort((a, b) => a.rank - b.rank);

    return NextResponse.json({
      success: true,
      data: markets,
      meta: {
        tab,
        count: markets.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching Polymarket Netflix markets:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch markets',
      },
      { status: 500 }
    );
  }
}
