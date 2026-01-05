/**
 * Daily Signals Ingestion Job
 *
 * Fetches daily interest signals from:
 * - Google Trends (relative search interest)
 * - Wikipedia (page view counts)
 *
 * These signals are used for nowcasting and momentum scoring.
 */

import { PrismaClient, GeoRegion, SignalSource } from '@prisma/client';
import googleTrends from 'google-trends-api';
import axios from 'axios';

import prisma from '@/lib/prisma';

// Wikipedia API endpoint for pageviews
const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

interface SignalResult {
  titleId: string;
  titleName: string;
  source: SignalSource;
  geo: GeoRegion;
  value: number;
  date: Date;
}

interface IngestSignalsResult {
  titlesProcessed: number;
  signalsCreated: number;
  trendsSuccesses: number;
  trendsFailed: number;
  wikipediaSuccesses: number;
  wikipediaFailed: number;
  errors: string[];
}

/**
 * Get active titles from the database (those with recent Netflix data)
 */
async function getActiveTitles(): Promise<{ id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }[]> {
  // Get titles that have appeared in Netflix Top 10 in the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const titlesWithGlobal = await prisma.title.findMany({
    where: {
      weeklyGlobal: {
        some: {
          weekStart: { gte: ninetyDaysAgo },
        },
      },
    },
    select: { id: true, canonicalName: true, type: true },
  });

  const titlesWithUS = await prisma.title.findMany({
    where: {
      weeklyUS: {
        some: {
          weekStart: { gte: ninetyDaysAgo },
        },
      },
    },
    select: { id: true, canonicalName: true, type: true },
  });

  // Combine and dedupe
  const titleMap = new Map<string, { id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }>();
  for (const title of [...titlesWithGlobal, ...titlesWithUS]) {
    titleMap.set(title.id, title);
  }

  return Array.from(titleMap.values());
}

/**
 * Fetch Google Trends interest data for a title
 * Returns relative search interest (0-100 scale)
 */
async function fetchGoogleTrends(
  titleName: string,
  geo: 'US' | ''
): Promise<number | null> {
  try {
    // Get interest over past 7 days to get a recent signal
    const result = await googleTrends.interestOverTime({
      keyword: titleName,
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      geo: geo || undefined,
    });

    const data = JSON.parse(result);
    const timeline = data?.default?.timelineData;

    if (!timeline || timeline.length === 0) {
      return null;
    }

    // Get the most recent value
    const latestPoint = timeline[timeline.length - 1];
    return latestPoint?.value?.[0] ?? null;
  } catch (error) {
    // Google Trends API can be flaky, don't throw
    console.warn(`Google Trends error for "${titleName}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch Wikipedia pageviews for a title
 * Returns the daily pageview count
 */
async function fetchWikipediaViews(
  titleName: string,
  date: Date
): Promise<number | null> {
  try {
    // Format the title for Wikipedia API (replace spaces with underscores)
    const articleTitle = titleName
      .replace(/\s+/g, '_')
      .replace(/['"]/g, ''); // Remove quotes

    // Format date for Wikipedia API (YYYYMMDD)
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

    // Try both TV series and film article formats
    const suffixes = ['', '_(TV_series)', '_(film)', '_(miniseries)'];

    for (const suffix of suffixes) {
      try {
        const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle + suffix)}/daily/${dateStr}/${dateStr}`;

        const response = await axios.get(url, {
          headers: {
            'User-Agent': process.env.WIKIPEDIA_USER_AGENT || 'PredictEasy/1.0',
          },
          timeout: 10000,
        });

        const items = response.data?.items;
        if (items && items.length > 0) {
          return items[0].views;
        }
      } catch {
        // Try next suffix
        continue;
      }
    }

    return null;
  } catch (error) {
    console.warn(`Wikipedia error for "${titleName}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Process a single title and fetch all signals
 */
async function processTitle(
  title: { id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' },
  date: Date,
  results: IngestSignalsResult
): Promise<SignalResult[]> {
  const signals: SignalResult[] = [];

  // Fetch Google Trends for US and Global
  const trendsUS = await fetchGoogleTrends(title.canonicalName, 'US');
  if (trendsUS !== null) {
    signals.push({
      titleId: title.id,
      titleName: title.canonicalName,
      source: 'TRENDS',
      geo: 'US',
      value: trendsUS,
      date,
    });
    results.trendsSuccesses++;
  } else {
    results.trendsFailed++;
  }

  // Small delay to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, 500));

  const trendsGlobal = await fetchGoogleTrends(title.canonicalName, '');
  if (trendsGlobal !== null) {
    signals.push({
      titleId: title.id,
      titleName: title.canonicalName,
      source: 'TRENDS',
      geo: 'GLOBAL',
      value: trendsGlobal,
      date,
    });
    results.trendsSuccesses++;
  } else {
    results.trendsFailed++;
  }

  // Fetch Wikipedia views (global only - Wikipedia doesn't have geo breakdown)
  const wikiViews = await fetchWikipediaViews(title.canonicalName, date);
  if (wikiViews !== null) {
    signals.push({
      titleId: title.id,
      titleName: title.canonicalName,
      source: 'WIKIPEDIA',
      geo: 'GLOBAL',
      value: wikiViews,
      date,
    });
    results.wikipediaSuccesses++;
  } else {
    results.wikipediaFailed++;
  }

  return signals;
}

/**
 * Main ingestion function
 */
export async function ingestDailySignals(
  targetDate?: Date
): Promise<IngestSignalsResult> {
  const date = targetDate || new Date();
  // Normalize to start of day
  date.setHours(0, 0, 0, 0);

  const results: IngestSignalsResult = {
    titlesProcessed: 0,
    signalsCreated: 0,
    trendsSuccesses: 0,
    trendsFailed: 0,
    wikipediaSuccesses: 0,
    wikipediaFailed: 0,
    errors: [],
  };

  try {
    // Get active titles
    const titles = await getActiveTitles();
    console.log(`Found ${titles.length} active titles to process`);

    if (titles.length === 0) {
      results.errors.push('No active titles found - run Netflix ingestion first');
      return results;
    }

    // Process each title
    for (const title of titles) {
      try {
        const signals = await processTitle(title, date, results);

        // Upsert signals to database
        for (const signal of signals) {
          await prisma.dailySignal.upsert({
            where: {
              titleId_date_source_geo: {
                titleId: signal.titleId,
                date: signal.date,
                source: signal.source,
                geo: signal.geo,
              },
            },
            create: {
              titleId: signal.titleId,
              date: signal.date,
              source: signal.source,
              geo: signal.geo,
              value: signal.value,
            },
            update: {
              value: signal.value,
            },
          });
          results.signalsCreated++;
        }

        results.titlesProcessed++;

        // Log progress every 10 titles
        if (results.titlesProcessed % 10 === 0) {
          console.log(`Processed ${results.titlesProcessed}/${titles.length} titles`);
        }

        // Rate limiting delay between titles
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        results.errors.push(
          `Error processing "${title.canonicalName}": ${error instanceof Error ? error.message : error}`
        );
      }
    }
  } catch (error) {
    results.errors.push(`Fatal error: ${error instanceof Error ? error.message : error}`);
  }

  return results;
}

/**
 * Run job with logging
 */
export async function runSignalsJob(targetDate?: Date): Promise<void> {
  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_daily_signals',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting daily signals ingestion...');
    const result = await ingestDailySignals(targetDate);

    const duration = Date.now() - startTime;
    console.log(`Signals ingestion complete in ${duration}ms`);
    console.log(`Titles processed: ${result.titlesProcessed}`);
    console.log(`Signals created: ${result.signalsCreated}`);
    console.log(`Trends: ${result.trendsSuccesses} success, ${result.trendsFailed} failed`);
    console.log(`Wikipedia: ${result.wikipediaSuccesses} success, ${result.wikipediaFailed} failed`);

    if (result.errors.length > 0) {
      console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 10));
    }

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Signals ingestion failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        detailsJson: { durationMs: duration },
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly
if (require.main === module) {
  runSignalsJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
