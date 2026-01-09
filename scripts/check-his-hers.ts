/**
 * Check His & Hers data and Polymarket titles coverage
 */
import prisma from '../src/lib/prisma';

async function main() {
  // Check His & Hers signals
  console.log('=== His & Hers Signals ===');
  const hisHers = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'His & Hers', mode: 'insensitive' } },
    include: {
      dailySignals: { take: 5, orderBy: { date: 'desc' } },
      weeklyUS: { take: 3, orderBy: { weekStart: 'desc' } }
    }
  });

  if (hisHers) {
    console.log('Title:', hisHers.canonicalName);
    console.log('Signals count:', hisHers.dailySignals.length);
    console.log('Netflix US entries:', hisHers.weeklyUS.length);
    if (hisHers.dailySignals.length > 0) {
      console.log('Recent signals:', hisHers.dailySignals);
    }
    if (hisHers.weeklyUS.length > 0) {
      console.log('Latest US ranking:', hisHers.weeklyUS[0]);
    }
  } else {
    console.log('NOT FOUND');
  }

  // Check Netflix US data - the table might have a different name
  console.log('\n=== Netflix Weekly US Data Check ===');

  // First check which tables exist
  const titleCount = await prisma.title.count();
  console.log('Total titles:', titleCount);

  // Check weeklyUS via a title
  const anyTitle = await prisma.title.findFirst({
    include: { weeklyUS: { take: 1 } }
  });
  console.log('Sample title weeklyUS entries:', anyTitle?.weeklyUS?.length ?? 0);

  // Check Polymarket titles that have signals
  console.log('\n=== Polymarket Titles Signal Coverage ===');
  const polyTitles = await prisma.title.findMany({
    where: { externalIds: { some: { provider: 'polymarket' } } },
    include: {
      dailySignals: { distinct: ['source'], select: { source: true } }
    }
  });

  for (const t of polyTitles) {
    const sources = t.dailySignals.map(s => s.source).join(', ') || 'NONE';
    console.log(`  ${t.canonicalName}: ${sources}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
