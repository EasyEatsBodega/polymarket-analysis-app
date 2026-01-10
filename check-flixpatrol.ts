import prisma from './src/lib/prisma';

async function check() {
  // Check all recent flixpatrol entries
  const all = await prisma.flixPatrolDaily.findMany({
    where: {
      category: 'tv',
      region: 'world',
      date: { gte: new Date('2026-01-08') }
    },
    orderBy: [{ date: 'desc' }, { rank: 'asc' }],
    select: { date: true, rank: true, titleName: true, titleId: true }
  });
  console.log('All recent TV entries:');
  all.forEach(t => console.log(t.date.toISOString().split('T')[0], '#' + t.rank, t.titleName, '| titleId:', t.titleId ? 'LINKED' : 'null'));

  // Also check Title table for His & Hers
  const hisHersTitle = await prisma.title.findMany({
    where: { canonicalName: { contains: 'His', mode: 'insensitive' } },
    take: 5
  });
  console.log('\nTitle table search for His:', hisHersTitle.map(t => t.canonicalName));
}

check().then(() => prisma.$disconnect());
