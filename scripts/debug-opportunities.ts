import prisma from '../src/lib/prisma';
import { matchOutcomeToTitle, buildTitleCache } from '../src/lib/marketMatcher';

async function debugOpportunities() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // 1. Check what comes from polymarket-netflix API
  console.log('\n=== 1. Fetching Polymarket Netflix data ===');
  let polymarketData: any[] = [];
  try {
    const response = await fetch(`${baseUrl}/api/polymarket-netflix`);
    const json = await response.json();
    if (json.success) {
      polymarketData = Array.isArray(json.data) ? json.data : Object.values(json.data).flat();
      console.log(`Found ${polymarketData.length} markets`);
      for (const market of polymarketData.slice(0, 3)) {
        console.log(`  Market: ${market.label || market.question}`);
        console.log(`  Outcomes: ${market.outcomes?.map((o: any) => `${o.name} (${(o.probability * 100).toFixed(1)}%)`).join(', ')}`);
      }
    }
  } catch (e) {
    console.error('Failed to fetch polymarket data:', e);
  }

  // 2. Get all titles
  console.log('\n=== 2. Database Titles ===');
  const allTitles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, type: true, aliases: true },
  });
  console.log(`Total titles in DB: ${allTitles.length}`);

  // 3. Build title cache and test matching
  console.log('\n=== 3. Testing Market Matching ===');
  const titleCache = buildTitleCache(allTitles);

  // Get unique outcomes from markets
  const outcomeNames = new Set<string>();
  for (const market of polymarketData) {
    for (const outcome of market.outcomes || []) {
      if (outcome.name.toLowerCase() !== 'other') {
        outcomeNames.add(outcome.name);
      }
    }
  }

  console.log(`Unique outcomes to match: ${outcomeNames.size}`);

  let matched = 0;
  let unmatched: string[] = [];

  for (const outcomeName of outcomeNames) {
    const match = matchOutcomeToTitle(outcomeName, titleCache);
    if (match.matchedTitleId) {
      matched++;
      console.log(`  ✓ "${outcomeName}" -> "${match.matchedTitleName}" (${match.matchConfidence})`);
    } else {
      unmatched.push(outcomeName);
    }
  }

  console.log(`\nMatched: ${matched}/${outcomeNames.size}`);
  if (unmatched.length > 0) {
    console.log(`Unmatched outcomes:`);
    for (const name of unmatched.slice(0, 10)) {
      console.log(`  ✗ "${name}"`);
    }
  }

  // 4. Check titles with Polymarket external IDs vs weekly data
  console.log('\n=== 4. Polymarket Titles Data Status ===');
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } }
    },
    include: {
      weeklyGlobal: {
        orderBy: { weekStart: 'desc' },
        take: 1
      }
    }
  });

  const withRanking = polymarketTitles.filter(t => t.weeklyGlobal.length > 0);
  const withoutRanking = polymarketTitles.filter(t => t.weeklyGlobal.length === 0);

  console.log(`Titles with ranking data: ${withRanking.length}`);
  for (const t of withRanking) {
    console.log(`  ✓ ${t.canonicalName} - Rank #${t.weeklyGlobal[0].rank}`);
  }

  console.log(`\nTitles WITHOUT ranking data: ${withoutRanking.length}`);
  for (const t of withoutRanking) {
    console.log(`  ✗ ${t.canonicalName}`);
  }
}

debugOpportunities()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
