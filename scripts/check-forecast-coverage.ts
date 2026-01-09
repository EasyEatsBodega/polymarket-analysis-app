/**
 * Check forecast coverage for Polymarket titles
 *
 * Verifies that all titles from Polymarket markets have:
 * 1. Proper database entry with polymarket externalId
 * 2. Recent forecasts generated
 */

import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== Polymarket Forecast Coverage Check ===\n');

  // Get all titles linked to Polymarket
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: {
        some: { provider: 'polymarket' },
      },
    },
    include: {
      externalIds: {
        where: { provider: 'polymarket' },
      },
      forecasts: {
        orderBy: { weekStart: 'desc' },
        take: 1,
      },
    },
  });

  console.log(`Found ${polymarketTitles.length} titles linked to Polymarket\n`);

  // Categorize titles
  const withForecast: string[] = [];
  const withoutForecast: string[] = [];
  const staleForecasts: string[] = [];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  for (const title of polymarketTitles) {
    const latestForecast = title.forecasts[0];

    if (!latestForecast) {
      withoutForecast.push(title.canonicalName);
    } else if (latestForecast.weekStart < oneWeekAgo) {
      staleForecasts.push(`${title.canonicalName} (last: ${latestForecast.weekStart.toISOString().split('T')[0]})`);
    } else {
      withForecast.push(title.canonicalName);
    }
  }

  console.log('--- Titles WITH recent forecasts ---');
  if (withForecast.length === 0) {
    console.log('  None');
  } else {
    for (const name of withForecast) {
      console.log(`  ✓ ${name}`);
    }
  }

  console.log('\n--- Titles WITHOUT forecasts ---');
  if (withoutForecast.length === 0) {
    console.log('  None - All titles have forecasts!');
  } else {
    for (const name of withoutForecast) {
      console.log(`  ❌ ${name}`);
    }
  }

  console.log('\n--- Titles with STALE forecasts ---');
  if (staleForecasts.length === 0) {
    console.log('  None - All forecasts are recent!');
  } else {
    for (const name of staleForecasts) {
      console.log(`  ⚠️ ${name}`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total Polymarket titles: ${polymarketTitles.length}`);
  console.log(`With recent forecasts: ${withForecast.length}`);
  console.log(`Without forecasts: ${withoutForecast.length}`);
  console.log(`With stale forecasts: ${staleForecasts.length}`);

  // Check for titles that should have creator boosts
  console.log('\n=== Creator Track Record Coverage ===');
  const { getCreatorTrackRecord } = await import('../src/lib/creatorTrackRecord');

  let withCreator = 0;
  let withoutCreator = 0;

  for (const title of polymarketTitles) {
    const record = getCreatorTrackRecord(title.canonicalName);
    if (record) {
      console.log(`  ✓ ${title.canonicalName} → ${record.creator} (${Math.round(record.record.hitRate * 100)}% hit rate)`);
      withCreator++;
    } else {
      withoutCreator++;
    }
  }

  console.log(`\nWith creator match: ${withCreator}/${polymarketTitles.length}`);
  console.log(`Without creator match: ${withoutCreator}/${polymarketTitles.length}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
