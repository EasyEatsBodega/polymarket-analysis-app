/**
 * Check FlixPatrol data status
 */
import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== FlixPatrol Data Check ===\n');

  // Check total records
  const total = await prisma.flixPatrolDaily.count();
  console.log(`Total FlixPatrol records: ${total}`);

  if (total === 0) {
    console.log('\nNo FlixPatrol data yet. Need to run ingestion job.');
    return;
  }

  // Get latest data
  const latest = await prisma.flixPatrolDaily.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  if (latest) {
    console.log(`Latest data date: ${latest.date.toISOString().split('T')[0]}`);
  }

  // Show sample TV Top 10
  console.log('\n=== Latest TV Top 10 ===');
  const latestTV = await prisma.flixPatrolDaily.findMany({
    where: { category: 'tv', region: 'world' },
    orderBy: [{ date: 'desc' }, { rank: 'asc' }],
    take: 10,
    include: {
      title: { select: { canonicalName: true } },
    },
  });

  for (const row of latestTV) {
    const matched = row.title?.canonicalName || 'NOT MATCHED';
    console.log(`  #${row.rank}: ${row.titleName} (${row.points} pts) → ${matched}`);
  }

  // Show matching stats
  console.log('\n=== Title Matching Stats ===');
  const matched = await prisma.flixPatrolDaily.count({
    where: { titleId: { not: null } },
  });
  console.log(`Matched to titles: ${matched}/${total} (${((matched / total) * 100).toFixed(1)}%)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
