/**
 * Backfill Historical Google Trends Data
 *
 * Fetches historical Google Trends data for all active titles.
 * Uses 90-day windows to get daily granularity.
 *
 * Usage:
 *   npx tsx scripts/backfill-google-trends.ts [--days=90] [--title="Stranger Things"]
 *
 * Options:
 *   --days=N     Number of days to backfill (default: 90, max recommended: 90 for daily data)
 *   --title=X    Only backfill a specific title
 *   --dry-run    Preview what would be fetched without saving
 */

import prisma from '../src/lib/prisma';
import googleTrends from 'google-trends-api';
import { GeoRegion, SignalSource } from '@prisma/client';

const RATE_LIMIT_DELAY = 3000; // 3 seconds between requests to avoid rate limiting
const MAX_DAYS_FOR_DAILY = 90; // Google gives daily data for periods ≤90 days

interface TrendsDataPoint {
  date: Date;
  value: number;
}

/**
 * Fetch Google Trends historical data for a date range
 * Returns daily values for the period
 */
async function fetchHistoricalTrends(
  keyword: string,
  startDate: Date,
  endDate: Date,
  geo: 'US' | ''
): Promise<TrendsDataPoint[]> {
  try {
    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: startDate,
      endTime: endDate,
      geo: geo || undefined,
      granularTimeResolution: true, // Request daily data when available
    });

    const data = JSON.parse(result);
    const timeline = data?.default?.timelineData;

    if (!timeline || timeline.length === 0) {
      return [];
    }

    return timeline.map((point: { time: string; value: number[] }) => ({
      date: new Date(parseInt(point.time) * 1000),
      value: point.value[0] ?? 0,
    }));
  } catch (error) {
    console.warn(`Trends error for "${keyword}" (${geo || 'GLOBAL'}):`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Get active titles to backfill
 */
async function getActiveTitles(specificTitle?: string) {
  if (specificTitle) {
    const title = await prisma.title.findFirst({
      where: {
        canonicalName: { contains: specificTitle, mode: 'insensitive' },
      },
      select: { id: true, canonicalName: true, type: true },
    });
    return title ? [title] : [];
  }

  // Get titles with recent Netflix data or from Polymarket
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const titlesWithGlobal = await prisma.title.findMany({
    where: {
      weeklyGlobal: { some: { weekStart: { gte: ninetyDaysAgo } } },
    },
    select: { id: true, canonicalName: true, type: true },
  });

  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } },
    },
    select: { id: true, canonicalName: true, type: true },
  });

  // Dedupe
  const titleMap = new Map<string, { id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }>();
  for (const t of [...titlesWithGlobal, ...polymarketTitles]) {
    titleMap.set(t.id, t);
  }

  return Array.from(titleMap.values());
}

/**
 * Backfill historical trends for a title
 */
async function backfillTitle(
  title: { id: string; canonicalName: string },
  daysBack: number,
  dryRun: boolean
): Promise<{ usPoints: number; globalPoints: number }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  console.log(`  Fetching ${daysBack} days of trends for "${title.canonicalName}"...`);

  // Fetch US trends
  const usTrends = await fetchHistoricalTrends(title.canonicalName, startDate, endDate, 'US');
  console.log(`    US: ${usTrends.length} data points`);

  await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));

  // Fetch Global trends
  const globalTrends = await fetchHistoricalTrends(title.canonicalName, startDate, endDate, '');
  console.log(`    Global: ${globalTrends.length} data points`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would save ${usTrends.length + globalTrends.length} signals`);
    return { usPoints: usTrends.length, globalPoints: globalTrends.length };
  }

  // Save US trends
  for (const point of usTrends) {
    const date = new Date(point.date);
    date.setHours(0, 0, 0, 0);

    await prisma.dailySignal.upsert({
      where: {
        titleId_date_source_geo: {
          titleId: title.id,
          date,
          source: 'TRENDS' as SignalSource,
          geo: 'US' as GeoRegion,
        },
      },
      create: {
        titleId: title.id,
        date,
        source: 'TRENDS' as SignalSource,
        geo: 'US' as GeoRegion,
        value: point.value,
      },
      update: {
        value: point.value,
      },
    });
  }

  // Save Global trends
  for (const point of globalTrends) {
    const date = new Date(point.date);
    date.setHours(0, 0, 0, 0);

    await prisma.dailySignal.upsert({
      where: {
        titleId_date_source_geo: {
          titleId: title.id,
          date,
          source: 'TRENDS' as SignalSource,
          geo: 'GLOBAL' as GeoRegion,
        },
      },
      create: {
        titleId: title.id,
        date,
        source: 'TRENDS' as SignalSource,
        geo: 'GLOBAL' as GeoRegion,
        value: point.value,
      },
      update: {
        value: point.value,
      },
    });
  }

  console.log(`    Saved ${usTrends.length + globalTrends.length} signals`);
  return { usPoints: usTrends.length, globalPoints: globalTrends.length };
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const daysArg = args.find(a => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 90;

  const titleArg = args.find(a => a.startsWith('--title='));
  const specificTitle = titleArg ? titleArg.split('=')[1].replace(/"/g, '') : undefined;

  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Google Trends Historical Backfill');
  console.log('='.repeat(60));
  console.log(`Days to backfill: ${days}`);
  console.log(`Specific title: ${specificTitle || 'All active titles'}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  if (days > MAX_DAYS_FOR_DAILY) {
    console.warn(`⚠️  Warning: Requesting ${days} days. Google Trends provides weekly (not daily) data for periods >90 days.`);
  }

  const titles = await getActiveTitles(specificTitle);

  if (titles.length === 0) {
    console.log('No titles found to process.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${titles.length} title(s) to process\n`);

  let totalUS = 0;
  let totalGlobal = 0;
  let processed = 0;
  let failed = 0;

  for (const title of titles) {
    try {
      const result = await backfillTitle(title, days, dryRun);
      totalUS += result.usPoints;
      totalGlobal += result.globalPoints;
      processed++;
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
      failed++;
    }

    // Rate limit between titles
    if (titles.indexOf(title) < titles.length - 1) {
      console.log(`  Waiting ${RATE_LIMIT_DELAY / 1000}s before next title...`);
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Titles processed: ${processed}`);
  console.log(`Titles failed: ${failed}`);
  console.log(`US data points: ${totalUS}`);
  console.log(`Global data points: ${totalGlobal}`);
  console.log(`Total signals: ${totalUS + totalGlobal}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
