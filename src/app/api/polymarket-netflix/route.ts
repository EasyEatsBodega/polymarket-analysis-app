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

// Known recent event IDs to try first (discovered from Polymarket search)
// Format: { pattern-keyword: [ids] } - these are tried before scanning the full range
const KNOWN_RECENT_IDS = [872, 835, 812, 756, 748, 592, 237, 125];

// Fallback range if known IDs don't work (only used if all known IDs fail)
const ID_RANGE_START = 100;
const ID_RANGE_END = 950;

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
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

    // Only return if active and has markets
    if (event.active && !event.closed && event.markets?.length > 0) {
      return event;
    }

    return null;
  } catch {
    return null;
  }
}

async function findActiveMarketId(basePattern: string): Promise<number | null> {
  // Check cache first
  const cached = marketIdCache.get(basePattern);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.id;
  }

  // First, try known recent IDs (fast path)
  const knownResults = await Promise.all(
    KNOWN_RECENT_IDS.map(async (id) => {
      const slug = `${basePattern}-${id}`;
      const event = await fetchEventBySlug(slug);
      return event ? id : null;
    })
  );

  const foundKnownId = knownResults.find(id => id !== null);
  if (foundKnownId) {
    marketIdCache.set(basePattern, { id: foundKnownId, timestamp: Date.now() });
    return foundKnownId;
  }

  // Also try without a number suffix
  const eventNoSuffix = await fetchEventBySlug(basePattern);
  if (eventNoSuffix) {
    marketIdCache.set(basePattern, { id: 0, timestamp: Date.now() });
    return 0;
  }

  // Fallback: scan broader range in batches (only if known IDs failed)
  // Start from high and go low, checking newer markets first
  for (let start = ID_RANGE_END; start >= ID_RANGE_START; start -= 50) {
    const batch: number[] = [];
    for (let id = start; id > Math.max(start - 50, ID_RANGE_START - 1); id--) {
      // Skip IDs we already tried
      if (!KNOWN_RECENT_IDS.includes(id)) {
        batch.push(id);
      }
    }

    if (batch.length === 0) continue;

    const results = await Promise.all(
      batch.map(async (id) => {
        const slug = `${basePattern}-${id}`;
        const event = await fetchEventBySlug(slug);
        return event ? id : null;
      })
    );

    const foundId = results.find(id => id !== null);
    if (foundId) {
      marketIdCache.set(basePattern, { id: foundId, timestamp: Date.now() });
      return foundId;
    }
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
