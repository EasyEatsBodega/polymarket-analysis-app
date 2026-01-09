/**
 * Polymarket Netflix Markets API
 *
 * Fetches current week's Netflix prediction markets from Polymarket.
 * Markets update every Tuesday at 12pm EST.
 *
 * Uses database-backed caching to avoid expensive market scanning.
 * Fast path: ~500ms (cached slugs)
 * Slow path: ~10-30s (full market discovery scan)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedMarkets,
  setCachedMarkets,
  getMarketFromCache,
  clearMarketCache,
} from '@/lib/marketCache';

export const dynamic = 'force-dynamic';

// Known Netflix market slug patterns - the number suffix changes weekly
// US markets = US-only content, Global markets = ALL content (including US)
const MARKET_PATTERNS = [
  // US Shows
  { basePattern: 'what-will-be-the-top-us-netflix-show-this-week', category: 'shows-us', rank: 1, label: '#1 US TV Show' },
  { basePattern: 'what-will-be-the-2-us-netflix-show-this-week', category: 'shows-us', rank: 2, label: '#2 US TV Show' },

  // Global Shows (includes US + international)
  { basePattern: 'what-will-be-the-top-global-netflix-show-this-week', category: 'shows-global', rank: 1, label: '#1 Global TV Show' },
  { basePattern: 'what-will-be-the-2-global-netflix-show-this-week', category: 'shows-global', rank: 2, label: '#2 Global TV Show' },

  // US Movies
  { basePattern: 'what-will-be-the-top-us-netflix-movie-this-week', category: 'films-us', rank: 1, label: '#1 US Movie' },
  { basePattern: 'what-will-be-the-2-us-netflix-movie-this-week', category: 'films-us', rank: 2, label: '#2 US Movie' },

  // Global Movies (includes US + international)
  { basePattern: 'what-will-be-the-top-global-netflix-movie-this-week', category: 'films-global', rank: 1, label: '#1 Global Movie' },
  { basePattern: 'what-will-be-the-2-global-netflix-movie-this-week', category: 'films-global', rank: 2, label: '#2 Global Movie' },
];

// Market discovery scan settings (only used on cache miss)
const HOT_RANGES: Record<string, { start: number; end: number }> = {
  'shows': { start: 450, end: 800 },
  'movies': { start: 850, end: 1200 },
};
const EXTENDED_RANGE = { start: 400, end: 1500 };
const SCAN_BATCH_SIZE = 50;

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

/**
 * Fetch a Polymarket event by its full slug
 */
async function fetchEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) return null;

    const events: PolymarketEvent[] = await response.json();

    if (events.length === 0) return null;

    const event = events[0];

    if (event.markets?.length > 0) {
      return event;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse market outcomes from a Polymarket event
 */
function parseMarketOutcomes(event: PolymarketEvent): ParsedOutcome[] {
  const outcomes: ParsedOutcome[] = [];

  if (!event.markets) return outcomes;

  for (const market of event.markets) {
    if (!market.active || market.groupItemTitle?.includes('Show ') || market.groupItemTitle?.includes('Movie ')) {
      continue;
    }

    try {
      const prices = JSON.parse(market.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0]) || 0;

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

  outcomes.sort((a, b) => b.probability - a.probability);

  return outcomes;
}

/**
 * Scan a range of market IDs to find active markets (expensive operation)
 */
async function scanRange(
  basePattern: string,
  rangeStart: number,
  rangeEnd: number
): Promise<{ id: number; closed: boolean; slug: string } | null> {
  const foundMarkets: { id: number; closed: boolean; slug: string }[] = [];

  for (let start = rangeEnd; start >= rangeStart; start -= SCAN_BATCH_SIZE) {
    const batch: number[] = [];
    for (let id = start; id > Math.max(start - SCAN_BATCH_SIZE, rangeStart - 1); id--) {
      batch.push(id);
    }

    const results = await Promise.all(
      batch.map(async (id) => {
        const slug = `${basePattern}-${id}`;
        const event = await fetchEventBySlug(slug);
        return event ? { id, event, slug } : null;
      })
    );

    for (const result of results) {
      if (result) {
        foundMarkets.push({ id: result.id, closed: result.event.closed, slug: result.slug });

        if (!result.event.closed) {
          return { id: result.id, closed: false, slug: result.slug };
        }
      }
    }
  }

  if (foundMarkets.length > 0) {
    foundMarkets.sort((a, b) => b.id - a.id);
    return foundMarkets[0];
  }

  return null;
}

/**
 * Discover a market by scanning ID ranges (slow, only used on cache miss)
 */
async function discoverMarket(basePattern: string): Promise<{
  id: number;
  slug: string;
  closed: boolean;
} | null> {
  // Try without suffix first
  const eventNoSuffix = await fetchEventBySlug(basePattern);
  if (eventNoSuffix && !eventNoSuffix.closed) {
    return { id: 0, slug: basePattern, closed: false };
  }

  const isMovie = basePattern.includes('movie');
  const hotRange = isMovie ? HOT_RANGES['movies'] : HOT_RANGES['shows'];

  let bestClosedMarket: { id: number; closed: boolean; slug: string } | null = null;

  // Check hot range first
  const hotResult = await scanRange(basePattern, hotRange.start, hotRange.end);
  if (hotResult && !hotResult.closed) {
    return hotResult;
  }
  if (hotResult) {
    bestClosedMarket = hotResult;
  }

  // Check above hot range
  if (hotRange.end < EXTENDED_RANGE.end) {
    const aboveResult = await scanRange(basePattern, hotRange.end + 1, EXTENDED_RANGE.end);
    if (aboveResult && !aboveResult.closed) {
      return aboveResult;
    }
    if (aboveResult && (!bestClosedMarket || aboveResult.id > bestClosedMarket.id)) {
      bestClosedMarket = aboveResult;
    }
  }

  // Check below hot range
  if (hotRange.start > EXTENDED_RANGE.start) {
    const belowResult = await scanRange(basePattern, EXTENDED_RANGE.start, hotRange.start - 1);
    if (belowResult && !belowResult.closed) {
      return belowResult;
    }
    if (belowResult && (!bestClosedMarket || belowResult.id > bestClosedMarket.id)) {
      bestClosedMarket = belowResult;
    }
  }

  if (bestClosedMarket) {
    return bestClosedMarket;
  }

  if (eventNoSuffix) {
    return { id: 0, slug: basePattern, closed: true };
  }

  return null;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = request.nextUrl;
    const tab = searchParams.get('tab');
    const refresh = searchParams.get('refresh') === 'true';

    // Clear database cache if refresh requested
    if (refresh) {
      console.log('[polymarket-netflix] Refresh requested, clearing cache');
      await clearMarketCache();
    }

    // Filter patterns by category if tab is provided
    const patternsToFetch = tab
      ? MARKET_PATTERNS.filter(p => p.category === tab)
      : MARKET_PATTERNS;

    // Try to use database cache (fast path)
    const cache = await getCachedMarkets();
    const useCache = cache && !refresh;

    if (useCache) {
      console.log('[polymarket-netflix] Using cached market slugs');
    } else {
      console.log('[polymarket-netflix] Cache miss, will scan for markets');
    }

    // Fetch markets - use cached slugs when available
    const marketPromises = patternsToFetch.map(async (config) => {
      let slug: string | null = null;
      let marketId: number | null = null;
      let closed = false;

      // Fast path: use cached slug
      if (useCache) {
        const cachedMarket = getMarketFromCache(cache, config.basePattern);
        if (cachedMarket) {
          slug = cachedMarket.slug;
          marketId = cachedMarket.id;
          closed = cachedMarket.closed;
        }
      }

      // Slow path: discover market by scanning
      if (!slug) {
        console.log(`[polymarket-netflix] Discovering market for ${config.basePattern}`);
        const discovered = await discoverMarket(config.basePattern);
        if (discovered) {
          slug = discovered.slug;
          marketId = discovered.id;
          closed = discovered.closed;
        }
      }

      if (!slug) {
        return { config, event: null, marketId: null, closed: false };
      }

      // Fetch the actual event data
      const event = await fetchEventBySlug(slug);
      return { config, event, slug, marketId, closed };
    });

    const results = await Promise.all(marketPromises);

    // If we did discovery (no cache), save the results to database
    if (!useCache) {
      const discoveredMarkets = results
        .filter(r => r.slug && r.marketId !== null)
        .map(r => ({
          pattern: r.config.basePattern,
          slug: r.slug!,
          id: r.marketId!,
          closed: r.closed,
          discoveredAt: new Date().toISOString(),
        }));

      if (discoveredMarkets.length > 0) {
        await setCachedMarkets(discoveredMarkets);
      }
    }

    // Parse and format the results
    const markets: ParsedMarket[] = results
      .filter(r => r.event)
      .map(r => {
        const outcomes = parseMarketOutcomes(r.event!);
        if (outcomes.length === 0) return null;

        return {
          slug: r.event!.slug,
          label: r.config.label,
          question: r.event!.title,
          category: r.config.category,
          rank: r.config.rank,
          outcomes,
          totalVolume: r.event!.volume || 0,
          polymarketUrl: `https://polymarket.com/event/${r.event!.slug}`,
        };
      })
      .filter((m): m is ParsedMarket => m !== null);

    const duration = Date.now() - startTime;
    console.log(`[polymarket-netflix] Completed in ${duration}ms, found ${markets.length} markets`);

    // Group by category if no specific tab requested
    if (!tab) {
      const grouped: Record<string, ParsedMarket[]> = {
        'shows-us': [],
        'shows-global': [],
        'films-us': [],
        'films-global': [],
      };

      for (const market of markets) {
        if (grouped[market.category]) {
          grouped[market.category].push(market);
        }
      }

      for (const category of Object.keys(grouped)) {
        grouped[category].sort((a, b) => a.rank - b.rank);
      }

      return NextResponse.json({
        success: true,
        data: grouped,
        meta: {
          totalMarkets: markets.length,
          fetchedAt: new Date().toISOString(),
          duration: `${duration}ms`,
          cached: useCache,
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
        duration: `${duration}ms`,
        cached: useCache,
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
