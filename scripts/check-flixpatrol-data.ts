import prisma from '../src/lib/prisma';

async function check() {
  // Get some FlixPatrol records
  const total = await prisma.flixPatrolDaily.count();
  console.log('Total FlixPatrol records:', total);

  // Get unique titles with FlixPatrol data
  const titlesWithData = await prisma.flixPatrolDaily.findMany({
    where: { titleId: { not: null } },
    select: { titleId: true, titleName: true },
    distinct: ['titleId'],
    take: 20,
  });
  console.log('\nTitles with FlixPatrol data:', titlesWithData.length);

  for (const t of titlesWithData.slice(0, 5)) {
    const count = await prisma.flixPatrolDaily.count({
      where: { titleId: t.titleId },
    });
    console.log(`  ${t.titleName}: ${count} records`);
  }

  // Get sample record
  const sample = await prisma.flixPatrolDaily.findFirst({
    orderBy: { date: 'desc' },
  });
  console.log('\nLatest record:', sample);

  // Check regions
  const regions = await prisma.flixPatrolDaily.groupBy({
    by: ['region'],
    _count: true,
  });
  console.log('\nRecords by region:', regions);

  await prisma.$disconnect();
}

check().catch(console.error);
