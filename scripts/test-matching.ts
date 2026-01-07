import prisma from '../src/lib/prisma';
import { matchOutcomeToTitle, buildTitleCache } from '../src/lib/marketMatcher';

async function main() {
  // Get all titles
  const titles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, aliases: true },
  });
  console.log(`Loaded ${titles.length} titles from database\n`);

  const titleCache = buildTitleCache(titles);

  // Test matching for Polymarket outcomes
  const testOutcomes = [
    'Unlocked: A Jail Experiment: Season 2',
    'Stranger Things: Season 5',
    'His & Hers',
    '11.22.63',
    'Emily in Paris: Season 5',
    'Run Away',
  ];

  console.log('=== Title Matching Test ===\n');
  for (const outcome of testOutcomes) {
    const match = matchOutcomeToTitle(outcome, titleCache);
    console.log(`"${outcome}"`);
    if (match.matchedTitleId) {
      console.log(`  ✅ Matched: "${match.matchedTitleName}" (${match.matchConfidence})`);
    } else {
      console.log(`  ❌ No match found`);
    }
    console.log('');
  }

  // Check if specific titles exist
  console.log('=== Checking if titles exist in DB ===\n');
  const searchTerms = ['unlocked', 'his & hers', '11.22.63', 'emily in paris'];
  for (const term of searchTerms) {
    const found = titles.filter(t =>
      t.canonicalName.toLowerCase().includes(term.toLowerCase())
    );
    console.log(`"${term}": ${found.length > 0 ? found.map(f => f.canonicalName).join(', ') : 'NOT FOUND'}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
