/**
 * Check Run Away Netflix data
 */
const { PrismaClient } = require('@prisma/client');
const { withAccelerate } = require('@prisma/extension-accelerate');

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL,
}).$extends(withAccelerate());

async function main() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log('=== Checking Run Away Netflix Data ===\n');

  const runAway = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away' }
  });

  if (!runAway) {
    console.log('Run Away not found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('Run Away titleId:', runAway.id);

  const usData = await prisma.netflixWeeklyUS.findMany({
    where: {
      titleId: runAway.id,
      weekStart: { gte: thirtyDaysAgo }
    },
    take: 5,
    orderBy: { weekStart: 'desc' }
  });

  const globalData = await prisma.netflixWeeklyGlobal.findMany({
    where: {
      titleId: runAway.id,
      weekStart: { gte: thirtyDaysAgo }
    },
    take: 5,
    orderBy: { weekStart: 'desc' }
  });

  console.log('\nUS weeks (last 30 days):', usData.length);
  usData.forEach((d: any) => console.log('  ', d.weekStart.toISOString().split('T')[0], 'rank', d.rank));

  console.log('\nGlobal weeks (last 30 days):', globalData.length);
  globalData.forEach((d: any) => console.log('  ', d.weekStart.toISOString().split('T')[0], 'rank', d.rank));

  // This determines which forecast path it takes
  const hasRecentNetflixData = usData.length > 0 || globalData.length > 0;
  console.log('\nHas recent Netflix data:', hasRecentNetflixData);
  console.log('Forecast path:', hasRecentNetflixData ? 'generateForecast (NO Polymarket)' : 'generatePreReleaseForecast (WITH Polymarket)');

  await prisma.$disconnect();
}

main().catch(console.error);
