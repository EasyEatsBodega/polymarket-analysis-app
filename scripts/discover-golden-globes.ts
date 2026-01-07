/**
 * Golden Globes Market Discovery Script
 *
 * Explores Polymarket API to find all 2026 Golden Globes markets
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

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
  endDate?: string;
}

// Known Golden Globes category slugs based on search results
const GOLDEN_GLOBES_SLUGS = [
  'golden-globes-best-director-winner',
  'golden-globes-best-podcast-winner',
  'golden-globes-cinematic-and-box-office-achievement-winner',
  'golden-globes-best-motion-picture-non-english-language',
  'golden-globes-best-actor-drama',
  'golden-globes-best-actress-drama',
  'golden-globes-best-motion-picture-animated',
  'golden-globes-best-screenplay-motion-picture',
  'golden-globes-best-supporting-actor-television',
  'golden-globes-best-actor-television-drama',
  'golden-globes-best-actor-musical-or-comedy',
  'golden-globes-best-television-series-comedy-musical',
  'golden-globes-best-motion-picture-drama',
  'golden-globes-best-motion-picture-musical-or-comedy',
  'golden-globes-best-actress-musical-or-comedy',
  'golden-globes-best-supporting-actress-motion-picture',
  'golden-globes-best-supporting-actor-motion-picture',
  'golden-globes-best-television-series-drama',
  'golden-globes-best-actress-television-drama',
  'golden-globes-best-actor-television-limited-series',
  'golden-globes-best-actress-television-limited-series',
  'golden-globes-best-television-limited-series',
  'golden-globes-best-original-song',
  'golden-globes-best-original-score',
];

async function fetchEvent(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const events: PolymarketEvent[] = await response.json();
    return events.length > 0 ? events[0] : null;
  } catch (error) {
    console.error(`Error fetching ${slug}:`, error);
    return null;
  }
}

function parseOutcomes(event: PolymarketEvent): Array<{ name: string; probability: number; volume: number }> {
  const outcomes: Array<{ name: string; probability: number; volume: number }> = [];

  if (!event.markets) return outcomes;

  for (const market of event.markets) {
    if (!market.active) continue;

    try {
      const prices = JSON.parse(market.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0]) || 0;

      if (yesPrice > 0.001) {
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

async function discoverAllMarkets() {
  console.log('🔍 Discovering Golden Globes markets on Polymarket...\n');

  const foundMarkets: Array<{
    slug: string;
    title: string;
    category: string;
    closed: boolean;
    volume: number;
    nominees: Array<{ name: string; probability: number; volume: number }>;
    polymarketUrl: string;
  }> = [];

  for (const slug of GOLDEN_GLOBES_SLUGS) {
    console.log(`Checking ${slug}...`);
    const event = await fetchEvent(slug);

    if (event) {
      const outcomes = parseOutcomes(event);
      const category = event.title
        .replace('Golden Globes: ', '')
        .replace(' Winner', '')
        .replace(' Predictions & Odds', '');

      foundMarkets.push({
        slug: event.slug,
        title: event.title,
        category,
        closed: event.closed,
        volume: event.volume,
        nominees: outcomes,
        polymarketUrl: `https://polymarket.com/event/${event.slug}`,
      });

      console.log(`  ✅ Found: ${category} (${outcomes.length} nominees, ${event.closed ? 'CLOSED' : 'OPEN'})`);
    } else {
      console.log(`  ❌ Not found`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n========================================');
  console.log(`Found ${foundMarkets.length} Golden Globes markets`);
  console.log('========================================\n');

  // Print summary
  for (const market of foundMarkets) {
    console.log(`\n📊 ${market.category}`);
    console.log(`   Status: ${market.closed ? '🔒 Closed' : '🟢 Open'}`);
    console.log(`   Volume: $${market.volume.toLocaleString()}`);
    console.log(`   URL: ${market.polymarketUrl}`);
    console.log(`   Nominees:`);

    for (const nominee of market.nominees.slice(0, 5)) {
      const pct = (nominee.probability * 100).toFixed(1);
      console.log(`     - ${nominee.name}: ${pct}%`);
    }

    if (market.nominees.length > 5) {
      console.log(`     ... and ${market.nominees.length - 5} more`);
    }
  }

  // Output JSON for seeding
  console.log('\n\n========================================');
  console.log('JSON Output for Database Seeding:');
  console.log('========================================\n');
  console.log(JSON.stringify(foundMarkets, null, 2));
}

discoverAllMarkets().catch(console.error);
