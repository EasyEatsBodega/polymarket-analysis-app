import prisma from '../src/lib/prisma';
import { matchOutcomeToTitle, buildTitleCache } from '../src/lib/marketMatcher';

const categoryMap: Record<string, string> = {
  'shows-english': 'TV (English)',
  'shows-non-english': 'TV (Non-English)',
  'films-english': 'Films (English)',
  'films-non-english': 'Films (Non-English)',
};

async function simulateOpportunities() {
  const categoryParam = 'shows-english';
  const netflixCategory = categoryMap[categoryParam];

  console.log(`=== Simulating Opportunities API for category: ${categoryParam} (${netflixCategory}) ===\n`);

  // 1. Get polymarket data (simulated)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let polymarketData: any[] = [];
  try {
    const response = await fetch(`${baseUrl}/api/polymarket-netflix`);
    const json = await response.json();
    if (json.success) {
      polymarketData = Array.isArray(json.data) ? json.data : Object.values(json.data).flat();
    }
  } catch (e) {
    console.error('Failed to fetch polymarket data, using mock data');
    polymarketData = [
      {
        outcomes: [
          { name: 'His & Hers', probability: 0.725 },
          { name: 'Run Away', probability: 0.26 },
          { name: '11.22.63', probability: 0.003 },
        ],
        polymarketUrl: 'https://polymarket.com/test'
      }
    ];
  }

  // 2. Get all titles and build cache
  const allTitles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, type: true, aliases: true }
  });
  const titleCache = buildTitleCache(allTitles);

  // 3. Build marketDataMap
  const marketDataMap = new Map<string, { probability: number; polymarketUrl: string }>();
  for (const market of polymarketData) {
    for (const outcome of market.outcomes || []) {
      if (outcome.name.toLowerCase() === 'other') continue;
      const match = matchOutcomeToTitle(outcome.name, titleCache);
      if (match.matchedTitleId) {
        marketDataMap.set(match.matchedTitleId, {
          probability: outcome.probability,
          polymarketUrl: market.polymarketUrl
        });
      }
    }
  }

  console.log('Market Data Map entries:', marketDataMap.size);
  for (const [id, data] of marketDataMap) {
    const title = allTitles.find(t => t.id === id);
    console.log(`  ${title?.canonicalName}: ${(data.probability * 100).toFixed(1)}%`);
  }

  // 4. Get current week data (titles with rankings)
  const latestWeek = await prisma.netflixWeeklyGlobal.findFirst({
    orderBy: { weekStart: 'desc' },
    select: { weekStart: true }
  });

  console.log(`\nLatest week: ${latestWeek?.weekStart}`);

  const currentWeekData = latestWeek ? await prisma.netflixWeeklyGlobal.findMany({
    where: {
      weekStart: latestWeek.weekStart,
      category: netflixCategory
    },
    select: { titleId: true, rank: true, category: true }
  }) : [];

  console.log(`Current week titles in "${netflixCategory}": ${currentWeekData.length}`);
  const existingTitleIds = new Set(currentWeekData.map(w => w.titleId));

  // 5. Get Polymarket titles (pre-release)
  const allPolymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } }
    },
    select: { id: true, canonicalName: true, type: true }
  });

  console.log(`\nPolymarket titles (all): ${allPolymarketTitles.length}`);

  const preReleaseTitles = allPolymarketTitles.filter(t => !existingTitleIds.has(t.id));
  console.log(`Pre-release titles (not in current week): ${preReleaseTitles.length}`);

  // 6. Process pre-release titles
  console.log('\n=== Processing Pre-Release Titles ===');
  const addedTitles: string[] = [];

  for (const title of preReleaseTitles) {
    const marketData = marketDataMap.get(title.id);
    const preReleaseCategory = title.type === 'MOVIE' ? 'Films (English)' : 'TV (English)';

    console.log(`\n${title.canonicalName} (${title.type}):`);
    console.log(`  Pre-release category: ${preReleaseCategory}`);
    console.log(`  Has market data: ${!!marketData}`);

    if (!marketData) {
      console.log(`  SKIPPED: No market data`);
      continue;
    }

    if (netflixCategory && preReleaseCategory !== netflixCategory) {
      console.log(`  SKIPPED: Category mismatch (${preReleaseCategory} vs ${netflixCategory})`);
      continue;
    }

    console.log(`  ADDED!`);
    addedTitles.push(title.canonicalName);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total added pre-release titles: ${addedTitles.length}`);
  for (const name of addedTitles) {
    console.log(`  - ${name}`);
  }
}

simulateOpportunities()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
