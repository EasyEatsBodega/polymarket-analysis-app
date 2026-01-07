/**
 * Test the Polymarket auto-discovery logic
 */

// Simulate the auto-discovery logic from the route

const HOT_RANGES: Record<string, { start: number; end: number }> = {
  'shows': { start: 450, end: 600 },  // US: 486, Global: 456
  'movies': { start: 850, end: 950 },
};
const EXTENDED_RANGE = { start: 400, end: 1000 };
const SCAN_BATCH_SIZE = 30;

interface PolymarketEvent {
  id: string;
  slug: string;
  closed: boolean;
  volume: number;
  markets: { active: boolean }[];
}

async function fetchEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return null;
    const events: PolymarketEvent[] = await response.json();
    if (events.length > 0 && events[0].markets?.length > 0) {
      return events[0];
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
  const isMovie = basePattern.includes('movie');
  const hotRange = isMovie ? HOT_RANGES['movies'] : HOT_RANGES['shows'];

  console.log(`  Checking hot range ${hotRange.start}-${hotRange.end}...`);
  const hotResult = await scanRange(basePattern, hotRange.start, hotRange.end);
  if (hotResult && !hotResult.closed) {
    console.log(`  ✅ Found ACTIVE in hot range: ${hotResult.id}`);
    return hotResult.id;
  }
  if (hotResult) {
    console.log(`  Found CLOSED in hot range: ${hotResult.id}`);
  }

  // Extended range below hot
  if (hotRange.start > EXTENDED_RANGE.start) {
    console.log(`  Checking extended range ${EXTENDED_RANGE.start}-${hotRange.start - 1}...`);
    const belowResult = await scanRange(basePattern, EXTENDED_RANGE.start, hotRange.start - 1);
    if (belowResult && !belowResult.closed) {
      console.log(`  ✅ Found ACTIVE below hot range: ${belowResult.id}`);
      return belowResult.id;
    }
    if (belowResult) {
      console.log(`  Found CLOSED below hot range: ${belowResult.id}`);
    }
  }

  // Extended range above hot
  if (hotRange.end < EXTENDED_RANGE.end) {
    console.log(`  Checking extended range ${hotRange.end + 1}-${EXTENDED_RANGE.end}...`);
    const aboveResult = await scanRange(basePattern, hotRange.end + 1, EXTENDED_RANGE.end);
    if (aboveResult && !aboveResult.closed) {
      console.log(`  ✅ Found ACTIVE above hot range: ${aboveResult.id}`);
      return aboveResult.id;
    }
    if (aboveResult) {
      console.log(`  Found CLOSED above hot range: ${aboveResult.id}`);
    }
  }

  // Return best closed
  if (hotResult) {
    console.log(`  ⚠️ No active found, using closed: ${hotResult.id}`);
    return hotResult.id;
  }

  console.log(`  ❌ No markets found`);
  return null;
}

async function main() {
  console.log('=== Testing Polymarket Auto-Discovery ===\n');

  const patterns = [
    { name: 'US Shows #1', pattern: 'what-will-be-the-top-us-netflix-show-this-week' },
    { name: 'US Movies #1', pattern: 'what-will-be-the-top-us-netflix-movie-this-week' },
    { name: 'Global Shows #1', pattern: 'what-will-be-the-top-global-netflix-show-this-week' },
    { name: 'Global Movies #1', pattern: 'what-will-be-the-top-global-netflix-movie-this-week' },
  ];

  const results: { name: string; id: number | null }[] = [];

  for (const { name, pattern } of patterns) {
    console.log(`\n${name}:`);
    const id = await findActiveMarketId(pattern);
    results.push({ name, id });
  }

  console.log('\n\n=== SUMMARY ===\n');
  for (const { name, id } of results) {
    if (id) {
      console.log(`✅ ${name}: ID ${id}`);
    } else {
      console.log(`❌ ${name}: No market found`);
    }
  }
}

main().catch(console.error);
