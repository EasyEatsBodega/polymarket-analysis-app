/**
 * Debug why Global Shows 456 isn't being found by scanRange
 */

interface PolymarketEvent {
  closed: boolean;
  markets: unknown[];
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

async function scanRangeWithDebug(
  basePattern: string,
  rangeStart: number,
  rangeEnd: number
): Promise<{ id: number; closed: boolean } | null> {
  const SCAN_BATCH_SIZE = 30;
  const foundMarkets: { id: number; closed: boolean }[] = [];

  console.log(`  Scanning ${rangeStart}-${rangeEnd} in batches of ${SCAN_BATCH_SIZE}`);

  for (let start = rangeEnd; start >= rangeStart; start -= SCAN_BATCH_SIZE) {
    const batch: number[] = [];
    for (let id = start; id > Math.max(start - SCAN_BATCH_SIZE, rangeStart - 1); id--) {
      batch.push(id);
    }

    console.log(`    Batch: ${batch[0]} to ${batch[batch.length - 1]} (${batch.length} IDs)`);

    const results = await Promise.all(
      batch.map(async (id) => {
        const slug = `${basePattern}-${id}`;
        const event = await fetchEventBySlug(slug);
        return event ? { id, event } : null;
      })
    );

    for (const result of results) {
      if (result) {
        console.log(`      Found: ${result.id} (closed=${result.event.closed})`);
        foundMarkets.push({ id: result.id, closed: result.event.closed });

        if (!result.event.closed) {
          console.log(`    ✅ Returning ACTIVE market: ${result.id}`);
          return { id: result.id, closed: false };
        }
      }
    }
  }

  if (foundMarkets.length > 0) {
    foundMarkets.sort((a, b) => b.id - a.id);
    console.log(`    Returning best closed: ${foundMarkets[0].id}`);
    return foundMarkets[0];
  }

  console.log(`    No markets found`);
  return null;
}

async function main() {
  console.log('=== Debug Global Shows Scan ===\n');

  const basePattern = 'what-will-be-the-top-global-netflix-show-this-week';

  console.log('Scanning hot range 450-600...\n');
  const result = await scanRangeWithDebug(basePattern, 450, 600);

  console.log('\nFinal result:', result);
}

main();
