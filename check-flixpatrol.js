const prisma = require('./src/lib/prisma').default;

async function check() {
  // Check what TV titles we have in recent data
  const recentTV = await prisma.flixPatrolDaily.findMany({
    where: {
      category: 'tv',
      region: 'world',
    },
    distinct: ['titleName'],
    select: { titleName: true, titleId: true },
    orderBy: { date: 'desc' },
    take: 30
  });
  console.log('Recent TV titles in FlixPatrolDaily:');
  recentTV.forEach(t => console.log('  -', t.titleName, '| titleId:', t.titleId));

  // Check for His & Hers specifically
  const hisHers = await prisma.flixPatrolDaily.findMany({
    where: { titleName: { contains: 'His', mode: 'insensitive' } },
    take: 5
  });
  console.log('\nSearching for "His":', hisHers.length > 0 ? hisHers.map(h => h.titleName) : 'NOT FOUND');

  // Check for Run Away
  const runAway = await prisma.flixPatrolDaily.findMany({
    where: { titleName: { contains: 'Run', mode: 'insensitive' } },
    take: 5
  });
  console.log('Searching for "Run":', runAway.length > 0 ? runAway.map(r => r.titleName) : 'NOT FOUND');
}

check().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
