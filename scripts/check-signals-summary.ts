/**
 * Quick signal summary check
 */
import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== Quick Signal Summary ===\n');

  // Get counts
  const totalTitles = await prisma.title.count();
  const titlesWithSignals = await prisma.dailySignal.findMany({
    distinct: ['titleId'],
    select: { titleId: true },
  });
  const wikiSignals = await prisma.dailySignal.findMany({
    where: { source: 'WIKIPEDIA' },
    distinct: ['titleId'],
    select: { titleId: true },
  });
  const trendsSignals = await prisma.dailySignal.findMany({
    where: { source: 'TRENDS' },
    distinct: ['titleId'],
    select: { titleId: true },
  });

  console.log(`Total titles: ${totalTitles}`);
  console.log(`Titles with ANY signals: ${titlesWithSignals.length}`);
  console.log(`Titles with Wikipedia: ${wikiSignals.length}`);
  console.log(`Titles with Trends: ${trendsSignals.length}`);
  console.log(`Titles with NO signals: ${totalTitles - titlesWithSignals.length}`);

  // Check His & Hers
  console.log('\n=== His & Hers Check ===');
  const hisHers = await prisma.title.findFirst({
    where: {
      OR: [
        { canonicalName: { contains: 'His & Hers', mode: 'insensitive' } },
        { canonicalName: { contains: 'His and Hers', mode: 'insensitive' } },
        { canonicalName: { contains: 'HisAndHers', mode: 'insensitive' } },
      ],
    },
  });

  if (hisHers) {
    console.log(`Found: ${hisHers.canonicalName} (${hisHers.id})`);
  } else {
    console.log('NOT FOUND - needs to be added');
  }

  // Check recent Netflix data to see what's actually ranking
  console.log('\n=== Current Top 10 US TV Shows ===');
  const latestWeek = await prisma.netflixWeeklyUS.findFirst({
    where: { category: 'TV (English)' },
    orderBy: { weekStart: 'desc' },
    select: { weekStart: true },
  });

  if (latestWeek) {
    const top10 = await prisma.netflixWeeklyUS.findMany({
      where: {
        weekStart: latestWeek.weekStart,
        category: 'TV (English)',
      },
      orderBy: { rank: 'asc' },
      take: 10,
      include: {
        title: { select: { canonicalName: true } },
      },
    });

    console.log(`Week of: ${latestWeek.weekStart.toISOString().split('T')[0]}`);
    for (const row of top10) {
      console.log(`  #${row.rank}: ${row.title?.canonicalName || row.titleId}`);
    }
  }

  // Check what Polymarket markets we have
  console.log('\n=== Polymarket Netflix Markets ===');
  const polyTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } },
    },
    include: {
      externalIds: { where: { provider: 'polymarket' } },
    },
    take: 20,
  });

  for (const t of polyTitles) {
    console.log(`  ${t.canonicalName}: ${t.externalIds.map((e) => e.externalId).join(', ')}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
