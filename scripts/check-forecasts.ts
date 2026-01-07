/**
 * Check forecasts for Wikipedia data
 */
const prisma = require('../src/lib/prisma').default;

async function main() {
  // Get forecasts with wikipediaRaw
  const forecastsWithWiki = await prisma.forecast.count({
    where: { wikipediaRaw: { not: null } }
  });
  console.log('Forecasts with Wikipedia data:', forecastsWithWiki);

  const forecastsWithTrends = await prisma.forecast.count({
    where: { trendsRaw: { not: null } }
  });
  console.log('Forecasts with Trends data:', forecastsWithTrends);

  // Sample forecast with Wikipedia
  const sample = await prisma.forecast.findFirst({
    where: { wikipediaRaw: { not: null } },
    include: { title: { select: { canonicalName: true } } }
  });
  if (sample) {
    console.log('\nSample forecast WITH Wikipedia:');
    console.log('  Title:', sample.title.canonicalName);
    console.log('  Wikipedia raw:', sample.wikipediaRaw);
    console.log('  Trends raw:', sample.trendsRaw);
    console.log('  Momentum:', sample.momentumScore);
  }

  // Sample forecast without Wikipedia
  const sampleNoWiki = await prisma.forecast.findFirst({
    where: {
      wikipediaRaw: null,
      trendsRaw: { not: null }
    },
    include: { title: { select: { canonicalName: true } } }
  });
  if (sampleNoWiki) {
    console.log('\nSample forecast WITHOUT Wikipedia:');
    console.log('  Title:', sampleNoWiki.title.canonicalName);
    console.log('  Wikipedia raw:', sampleNoWiki.wikipediaRaw);
    console.log('  Trends raw:', sampleNoWiki.trendsRaw);
    console.log('  Momentum:', sampleNoWiki.momentumScore);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
