/**
 * Polymarket Netflix Markets Fetcher
 *
 * Shared library for fetching Polymarket Netflix data.
 * Used by both the API route and the opportunities API to avoid internal HTTP calls.
 */

// Known Netflix market slug patterns - the number suffix changes weekly
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

// Scan ranges for market discovery
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

export interface ParsedOutcome {
  name: string;
  probability: number;
  volume: number;
}

export interface ParsedMarket {
  slug: string;
  label: string;
  question: string;
  category: string;
  rank: number;
  outcomes: ParsedOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

// In-memory cache
const marketIdCache: Map<string, { id: number; timestamp: number }> = new Map();
const CACHE_TTL = 15 * 60 * 1000;

async function fetchEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      {
        headers: { 'Accept': 'application/json' },
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

async function scanRange(
  basePattern: string,
  rangeStart: number,
  rangeEnd: number
): Promise<{ id: number; closed: boolean } | null> {
  const foundMarkets: { id: number; closed: boolean }[] = [];

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

        if (!result.event.closed) {
          return { id: result.id, closed: false };
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

async function findActiveMarketId(basePattern: string): Promise<number | null> {
  const cached = marketIdCache.get(basePattern);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const slug = cached.id === 0 ? basePattern : `${basePattern}-${cached.id}`;
    const event = await fetchEventBySlug(slug);
    if (event && !event.closed) {
      return cached.id;
    }
    marketIdCache.delete(basePattern);
  }

  const eventNoSuffix = await fetchEventBySlug(basePattern);
  if (eventNoSuffix && !eventNoSuffix.closed) {
    marketIdCache.set(basePattern, { id: 0, timestamp: Date.now() });
    return 0;
  }

  const isMovie = basePattern.includes('movie');
  const hotRange = isMovie ? HOT_RANGES['movies'] : HOT_RANGES['shows'];

  let bestClosedMarket: { id: number; closed: boolean } | null = null;

  const hotResult = await scanRange(basePattern, hotRange.start, hotRange.end);
  if (hotResult && !hotResult.closed) {
    marketIdCache.set(basePattern, { id: hotResult.id, timestamp: Date.now() });
    return hotResult.id;
  }
  if (hotResult) {
    bestClosedMarket = hotResult;
  }

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

  if (bestClosedMarket) {
    return bestClosedMarket.id;
  }

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
 * Fetch all Polymarket Netflix markets directly from Polymarket API
 * Returns flattened array of all markets across all categories
 */
export async function fetchAllPolymarketMarkets(): Promise<ParsedMarket[]> {
  const marketPromises = MARKET_PATTERNS.map(async (config) => {
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
  return results.filter((m): m is ParsedMarket => m !== null);
}

/**
 * Fetch Polymarket markets for a specific category
 */
export async function fetchPolymarketMarketsByCategory(category: string): Promise<ParsedMarket[]> {
  const patternsToFetch = MARKET_PATTERNS.filter(p => p.category === category);

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
  markets.sort((a, b) => a.rank - b.rank);

  return markets;
}
