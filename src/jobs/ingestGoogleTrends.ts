/**
 * Google Trends Daily Ingestion Job
 *
 * Fetches daily Google Trends data for all Polymarket Netflix titles.
 * This provides a leading indicator of viewing interest - people search before they watch.
 *
 * Run daily via cron or manually:
 *   npx tsx src/jobs/ingestGoogleTrends.ts
 *
 * API endpoint:
 *   POST /api/jobs/ingest-trends
 */

import googleTrends from 'google-trends-api';
import prisma from '@/lib/prisma';
import { GeoRegion, SignalSource } from '@prisma/client';

const RATE_LIMIT_DELAY = 2500; // 2.5 seconds between requests to avoid rate limiting
const LOOKBACK_DAYS = 7; // Fetch 7 days of daily data

interface TrendsDataPoint {
  date: Date;
  value: number;
}

interface IngestResult {
  titlesProcessed: number;
  signalsSaved: number;
  errors: string[];
  comparisons: TitleComparison[];
}

interface TitleComparison {
  name: string;
  avgTrendsUS: number | null;
  avgTrendsGlobal: number | null;
  trend: 'rising' | 'falling' | 'stable';
  momentum: number;
}

/**
 * Fetch recent Google Trends data for a keyword
 * Returns daily values for the last N days
 */
async function fetchRecentTrends(
  keyword: string,
  daysBack: number = LOOKBACK_DAYS,
  geo: 'US' | '' = ''
): Promise<TrendsDataPoint[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: startDate,
      endTime: endDate,
      geo: geo || undefined,
      granularTimeResolution: true,
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
    const message = error instanceof Error ? error.message : String(error);
    // Rate limiting or other API errors
    if (message.includes('429') || message.includes('rate')) {
      console.warn(`Rate limited for "${keyword}" (${geo || 'GLOBAL'}), will retry later`);
    } else {
      console.warn(`Trends error for "${keyword}" (${geo || 'GLOBAL'}):`, message);
    }
    return [];
  }
}

/**
 * Fetch comparison data for multiple keywords at once
 * This is more efficient than individual queries and provides relative comparison
 */
async function fetchTrendsComparison(
  keywords: string[],
  geo: 'US' | '' = ''
): Promise<Map<string, TrendsDataPoint[]>> {
  if (keywords.length === 0) return new Map();
  if (keywords.length > 5) {
    // Google Trends only allows 5 keywords at once
    console.warn('Limiting comparison to first 5 keywords');
    keywords = keywords.slice(0, 5);
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);

  const resultMap = new Map<string, TrendsDataPoint[]>();

  try {
    const result = await googleTrends.interestOverTime({
      keyword: keywords,
      startTime: startDate,
      endTime: endDate,
      geo: geo || undefined,
      granularTimeResolution: true,
    });

    const data = JSON.parse(result);
    const timeline = data?.default?.timelineData;

    if (!timeline || timeline.length === 0) {
      return resultMap;
    }

    // Initialize arrays for each keyword
    for (const kw of keywords) {
      resultMap.set(kw, []);
    }

    // Parse timeline data
    for (const point of timeline) {
      const date = new Date(parseInt(point.time) * 1000);
      const values = point.value as number[];

      for (let i = 0; i < keywords.length; i++) {
        const kwData = resultMap.get(keywords[i]);
        if (kwData) {
          kwData.push({ date, value: values[i] ?? 0 });
        }
      }
    }
  } catch (error) {
    console.warn(`Comparison error (${geo || 'GLOBAL'}):`, error instanceof Error ? error.message : error);
  }

  return resultMap;
}

/**
 * Calculate trend direction from data points
 */
function calculateTrend(points: TrendsDataPoint[]): 'rising' | 'falling' | 'stable' {
  if (points.length < 2) return 'stable';

  const firstHalf = points.slice(0, Math.floor(points.length / 2));
  const secondHalf = points.slice(Math.floor(points.length / 2));

  const firstAvg = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;

  const changePercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

  if (changePercent > 15) return 'rising';
  if (changePercent < -15) return 'falling';
  return 'stable';
}

/**
 * Get all Polymarket Netflix titles that need trends data
 */
async function getPolymarketTitles(): Promise<Array<{ id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }>> {
  // Get titles that are in active Polymarket markets
  const titlesWithPolymarket = await prisma.title.findMany({
    where: {
      externalIds: {
        some: { provider: 'polymarket' },
      },
    },
    select: { id: true, canonicalName: true, type: true },
  });

  // Also get titles currently in FlixPatrol Top 10 (potential competitors)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const flixPatrolTitles = await prisma.flixPatrolDaily.findMany({
    where: {
      date: { gte: threeDaysAgo },
      rank: { lte: 10 },
      titleId: { not: null },
    },
    select: {
      title: {
        select: { id: true, canonicalName: true, type: true },
      },
    },
    distinct: ['titleId'],
  });

  // Combine and dedupe
  const titleMap = new Map<string, { id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }>();

  for (const t of titlesWithPolymarket) {
    titleMap.set(t.id, t);
  }

  for (const fp of flixPatrolTitles) {
    if (fp.title) {
      titleMap.set(fp.title.id, fp.title);
    }
  }

  return Array.from(titleMap.values());
}

/**
 * Save trends data points to database
 */
async function saveTrendsData(
  titleId: string,
  points: TrendsDataPoint[],
  geo: GeoRegion
): Promise<number> {
  let saved = 0;

  for (const point of points) {
    const date = new Date(point.date);
    date.setHours(0, 0, 0, 0);

    try {
      await prisma.dailySignal.upsert({
        where: {
          titleId_date_source_geo: {
            titleId,
            date,
            source: SignalSource.TRENDS,
            geo,
          },
        },
        create: {
          titleId,
          date,
          source: SignalSource.TRENDS,
          geo,
          value: point.value,
        },
        update: {
          value: point.value,
        },
      });
      saved++;
    } catch (error) {
      // Ignore duplicate key errors
      if (!(error instanceof Error && error.message.includes('Unique constraint'))) {
        throw error;
      }
    }
  }

  return saved;
}

/**
 * Main ingestion function
 * Fetches Google Trends for all Polymarket titles and saves to database
 */
export async function ingestGoogleTrends(): Promise<IngestResult> {
  const result: IngestResult = {
    titlesProcessed: 0,
    signalsSaved: 0,
    errors: [],
    comparisons: [],
  };

  console.log('=== Google Trends Ingestion ===');

  // Get titles to process
  const titles = await getPolymarketTitles();

  if (titles.length === 0) {
    console.log('No titles to process');
    return result;
  }

  console.log(`Found ${titles.length} titles to fetch trends for\n`);

  // Process titles individually (for accurate data)
  for (const title of titles) {
    try {
      console.log(`Fetching trends for "${title.canonicalName}"...`);

      // Fetch US trends
      const usTrends = await fetchRecentTrends(title.canonicalName, LOOKBACK_DAYS, 'US');

      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));

      // Fetch Global trends
      const globalTrends = await fetchRecentTrends(title.canonicalName, LOOKBACK_DAYS, '');

      // Save to database
      const usSaved = usTrends.length > 0 ? await saveTrendsData(title.id, usTrends, GeoRegion.US) : 0;
      const globalSaved = globalTrends.length > 0 ? await saveTrendsData(title.id, globalTrends, GeoRegion.GLOBAL) : 0;

      result.signalsSaved += usSaved + globalSaved;
      result.titlesProcessed++;

      // Calculate comparison metrics
      const avgUS = usTrends.length > 0
        ? Math.round(usTrends.reduce((sum, p) => sum + p.value, 0) / usTrends.length)
        : null;
      const avgGlobal = globalTrends.length > 0
        ? Math.round(globalTrends.reduce((sum, p) => sum + p.value, 0) / globalTrends.length)
        : null;
      const trend = calculateTrend(globalTrends.length > 0 ? globalTrends : usTrends);

      // Momentum: combination of level and trend
      let momentum = avgGlobal ?? avgUS ?? 0;
      if (trend === 'rising') momentum += 15;
      if (trend === 'falling') momentum -= 15;

      result.comparisons.push({
        name: title.canonicalName,
        avgTrendsUS: avgUS,
        avgTrendsGlobal: avgGlobal,
        trend,
        momentum,
      });

      console.log(
        `  US: ${avgUS ?? 'N/A'}, Global: ${avgGlobal ?? 'N/A'}, Trend: ${trend} (saved ${usSaved + globalSaved} signals)`
      );

      // Rate limit
      if (titles.indexOf(title) < titles.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${title.canonicalName}: ${message}`);
      console.error(`  Error: ${message}`);
    }
  }

  // Sort comparisons by momentum (highest first)
  result.comparisons.sort((a, b) => b.momentum - a.momentum);

  console.log('\n=== Trends Comparison (sorted by momentum) ===');
  for (const comp of result.comparisons.slice(0, 10)) {
    const trendIcon = comp.trend === 'rising' ? '↑' : comp.trend === 'falling' ? '↓' : '→';
    console.log(
      `  ${comp.name}: US=${comp.avgTrendsUS ?? 'N/A'}, Global=${comp.avgTrendsGlobal ?? 'N/A'} ${trendIcon} (momentum: ${comp.momentum})`
    );
  }

  console.log(`\n=== Summary ===`);
  console.log(`Titles processed: ${result.titlesProcessed}`);
  console.log(`Signals saved: ${result.signalsSaved}`);
  console.log(`Errors: ${result.errors.length}`);

  return result;
}

/**
 * Compare specific titles head-to-head
 * Useful for analyzing competing new releases
 */
export async function compareTitlesHead2Head(
  titleNames: string[]
): Promise<{
  comparison: Map<string, { us: number; global: number; trend: string }>;
  winner: string | null;
  analysis: string;
}> {
  console.log(`\n=== Head-to-Head Comparison: ${titleNames.join(' vs ')} ===\n`);

  // Fetch comparison data (up to 5 titles at once)
  const usData = await fetchTrendsComparison(titleNames, 'US');
  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
  const globalData = await fetchTrendsComparison(titleNames, '');

  const comparison = new Map<string, { us: number; global: number; trend: string }>();
  let maxMomentum = -1;
  let winner: string | null = null;

  for (const name of titleNames) {
    const usPoints = usData.get(name) || [];
    const globalPoints = globalData.get(name) || [];

    const avgUS = usPoints.length > 0
      ? Math.round(usPoints.reduce((sum, p) => sum + p.value, 0) / usPoints.length)
      : 0;
    const avgGlobal = globalPoints.length > 0
      ? Math.round(globalPoints.reduce((sum, p) => sum + p.value, 0) / globalPoints.length)
      : 0;
    const trend = calculateTrend(globalPoints.length > 0 ? globalPoints : usPoints);

    comparison.set(name, { us: avgUS, global: avgGlobal, trend });

    // Calculate momentum for winner determination
    let momentum = Math.max(avgUS, avgGlobal);
    if (trend === 'rising') momentum += 20;
    if (trend === 'falling') momentum -= 20;

    if (momentum > maxMomentum) {
      maxMomentum = momentum;
      winner = name;
    }

    const trendIcon = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→';
    console.log(`${name}: US=${avgUS}, Global=${avgGlobal} ${trendIcon}`);
  }

  // Generate analysis
  let analysis = '';
  if (winner) {
    const winnerData = comparison.get(winner);
    const othersData = titleNames
      .filter((n) => n !== winner)
      .map((n) => ({ name: n, ...comparison.get(n) }));

    analysis = `Based on Google Trends data, "${winner}" has the highest search momentum`;

    if (winnerData?.trend === 'rising') {
      analysis += ' and is trending upward, suggesting growing viewer interest.';
    } else if (winnerData?.trend === 'stable') {
      analysis += ' with stable interest levels.';
    } else {
      analysis += ', though search interest is declining.';
    }

    // Compare with others
    for (const other of othersData) {
      if (other.trend === 'rising' && winnerData?.trend !== 'rising') {
        analysis += ` However, "${other.name}" is showing rising momentum and could overtake.`;
      }
    }
  }

  console.log(`\nWinner: ${winner}`);
  console.log(`Analysis: ${analysis}`);

  return { comparison, winner, analysis };
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  ingestGoogleTrends()
    .then((result) => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
