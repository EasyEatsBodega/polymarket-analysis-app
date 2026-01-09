/**
 * Check signal coverage across all titles
 */
import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== Signal Coverage Report ===\n');

  // Get all titles with their signal counts by source
  const titles = await prisma.title.findMany({
    select: {
      id: true,
      canonicalName: true,
      type: true,
      dailySignals: {
        select: {
          source: true,
          geo: true,
        },
        distinct: ['source', 'geo'],
      },
    },
    orderBy: { canonicalName: 'asc' },
  });

  const noWikipedia: string[] = [];
  const noTrends: string[] = [];
  const noSignals: string[] = [];

  for (const t of titles) {
    const hasWiki = t.dailySignals.some((s) => s.source === 'WIKIPEDIA');
    const hasTrends = t.dailySignals.some((s) => s.source === 'TRENDS');

    const signals = t.dailySignals.map((s) => `${s.source}/${s.geo}`).join(', ');
    const status = signals || 'NO SIGNALS';

    console.log(`${t.canonicalName} (${t.type})`);
    console.log(`  Signals: ${status}`);

    if (!hasWiki) noWikipedia.push(t.canonicalName);
    if (!hasTrends) noTrends.push(t.canonicalName);
    if (t.dailySignals.length === 0) noSignals.push(t.canonicalName);
  }

  console.log('\n=== Summary ===');
  console.log(`Total titles: ${titles.length}`);
  console.log(`Missing Wikipedia: ${noWikipedia.length}`);
  console.log(`Missing Trends: ${noTrends.length}`);
  console.log(`No signals at all: ${noSignals.length}`);

  if (noWikipedia.length > 0) {
    console.log('\n=== Titles Missing Wikipedia ===');
    noWikipedia.forEach((n) => console.log(`  - ${n}`));
  }

  if (noSignals.length > 0) {
    console.log('\n=== Titles With No Signals ===');
    noSignals.forEach((n) => console.log(`  - ${n}`));
  }

  // Check if "His & Hers" exists
  const hisHers = await prisma.title.findFirst({
    where: {
      OR: [
        { canonicalName: { contains: 'His & Hers', mode: 'insensitive' } },
        { canonicalName: { contains: 'His and Hers', mode: 'insensitive' } },
      ],
    },
  });

  console.log('\n=== His & Hers Check ===');
  if (hisHers) {
    console.log(`Found: ${hisHers.canonicalName} (${hisHers.id})`);
  } else {
    console.log('NOT FOUND - needs to be added');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
