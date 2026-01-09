import prisma from '../src/lib/prisma';
import { matchOutcomeToTitle, buildTitleCache } from '../src/lib/marketMatcher';

async function traceMarketMatching() {
  console.log('=== Tracing Market Matching ===\n');

  // 1. Get Polymarket titles (as opportunities API does)
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } }
    },
    select: { id: true, canonicalName: true, type: true }
  });

  console.log('1. Polymarket Titles (from externalIds query):');
  for (const t of polymarketTitles) {
    console.log(`  ${t.canonicalName}: ${t.id}`);
  }

  // 2. Get all titles for matching (as opportunities API does)
  const allTitles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, type: true, aliases: true }
  });
  const titleCache = buildTitleCache(allTitles);

  // 3. Simulate matching outcomes
  const testOutcomes = ['His & Hers', 'Run Away', '11.22.63', 'Stranger Things: Season 5'];

  console.log('\n2. Outcome Matching Results:');
  const marketDataMap = new Map<string, { outcome: string, probability: number }>();

  for (const outcome of testOutcomes) {
    const match = matchOutcomeToTitle(outcome, titleCache);
    console.log(`\n  Outcome: "${outcome}"`);
    console.log(`    Matched to: "${match.matchedTitleName}" (${match.matchConfidence})`);
    console.log(`    Title ID: ${match.matchedTitleId}`);

    if (match.matchedTitleId) {
      marketDataMap.set(match.matchedTitleId, { outcome, probability: 0.5 });
    }
  }

  // 4. Check which Polymarket titles would get market data
  console.log('\n3. Which Polymarket titles get market data?');
  for (const title of polymarketTitles) {
    const hasData = marketDataMap.has(title.id);
    const data = marketDataMap.get(title.id);
    console.log(`  ${title.canonicalName}: ${hasData ? `YES (from "${data?.outcome}")` : 'NO'}`);
  }

  // 5. Find mismatches - titles in polymarketTitles but not matched
  console.log('\n4. ID Comparison:');
  const polymarketIds = new Set(polymarketTitles.map(t => t.id));
  const matchedIds = new Set(marketDataMap.keys());

  for (const id of polymarketIds) {
    const title = polymarketTitles.find(t => t.id === id);
    const isMatched = matchedIds.has(id);
    if (!isMatched) {
      console.log(`  MISMATCH: "${title?.canonicalName}" (${id}) - has Polymarket external ID but no market match`);
    }
  }

  for (const id of matchedIds) {
    if (!polymarketIds.has(id)) {
      const data = marketDataMap.get(id);
      const title = allTitles.find(t => t.id === id);
      console.log(`  MISMATCH: "${title?.canonicalName}" (${id}) - matched from "${data?.outcome}" but no Polymarket external ID`);
    }
  }
}

traceMarketMatching()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
