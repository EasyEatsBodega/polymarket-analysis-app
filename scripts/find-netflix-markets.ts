/**
 * Find active Netflix markets on Polymarket
 * Scans to find current week's markets
 */

interface PolymarketEvent {
  id: string;
  slug: string;
  closed: boolean;
  volume: number;
  markets: { active: boolean }[];
}

async function checkSlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}`,
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

async function findActiveForPattern(pattern: string): Promise<{ id: number; closed: boolean } | null> {
  // Scan IDs from 900 down to 400, checking in batches
  const results: { id: number; closed: boolean }[] = [];

  for (let start = 900; start >= 400; start -= 50) {
    const promises = [];
    for (let id = start; id > start - 50 && id >= 400; id--) {
      promises.push(
        checkSlug(`${pattern}-${id}`).then(event =>
          event ? { id, closed: event.closed } : null
        )
      );
    }
    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  // Return highest active, or highest closed
  const active = results.find(r => !r.closed);
  if (active) return active;

  // Sort by ID desc
  results.sort((a, b) => b.id - a.id);
  return results[0] || null;
}

async function main() {
  console.log('=== Netflix Market Scanner ===\n');
  console.log('Looking for active markets...\n');

  // Check specific known IDs first
  const testIds = [486, 487, 488, 489, 490, 873, 874, 875, 876, 877, 878, 879, 880];

  const patterns = {
    'US Shows': 'what-will-be-the-top-us-netflix-show-this-week',
    'US Movies': 'what-will-be-the-top-us-netflix-movie-this-week',
    'Global Shows': 'what-will-be-the-top-global-netflix-show-this-week',
    'Global Movies': 'what-will-be-the-top-global-netflix-movie-this-week',
  };

  for (const [name, pattern] of Object.entries(patterns)) {
    console.log(`\n${name} (${pattern}):`);

    // Check test IDs first
    for (const id of testIds) {
      const event = await checkSlug(`${pattern}-${id}`);
      if (event) {
        const status = event.closed ? '❌ CLOSED' : '✅ ACTIVE';
        console.log(`  ${status} ID: ${id}`);
      }
    }
  }

  // Also check for any Netflix markets that might be active
  console.log('\n\n=== Checking if there are NO movie markets currently ===\n');

  // Try to find any active US movie market
  const moviePattern = 'what-will-be-the-top-us-netflix-movie-this-week';
  let foundActiveMovie = false;

  // Check 870-890 range (near latest closed 872)
  console.log('Scanning 870-900 for movies...');
  for (let id = 870; id <= 900; id++) {
    const event = await checkSlug(`${moviePattern}-${id}`);
    if (event) {
      const status = event.closed ? '❌ CLOSED' : '✅ ACTIVE';
      console.log(`  ${status} Movie ID: ${id}`);
      if (!event.closed) foundActiveMovie = true;
    }
  }

  if (!foundActiveMovie) {
    console.log('\n⚠️  No active US movie markets found.');
    console.log('   Polymarket may not have created this week\'s movie markets yet.');
  }
}

main().catch(console.error);
