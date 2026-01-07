/**
 * Check signal status
 */
import prisma from '../src/lib/prisma';

async function main() {
  // Check Wikipedia signals
  const wikiSignals = await prisma.dailySignal.count({
    where: { source: 'WIKIPEDIA' }
  });
  console.log(`Total Wikipedia signals in DB: ${wikiSignals}`);

  const distinctWiki = await prisma.dailySignal.findMany({
    where: { source: 'WIKIPEDIA' },
    distinct: ['titleId'],
    select: { titleId: true }
  });
  console.log(`Titles with Wikipedia data: ${distinctWiki.length}`);

  // Top 5 by views
  const topViews = await prisma.dailySignal.findMany({
    where: { source: 'WIKIPEDIA' },
    orderBy: { value: 'desc' },
    take: 5,
    include: { title: { select: { canonicalName: true } } }
  });
  console.log('\nTop 5 by views:');
  topViews.forEach(s => {
    console.log(`  ${s.title.canonicalName}: ${s.value.toLocaleString()} views on ${s.date.toISOString().split('T')[0]}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
