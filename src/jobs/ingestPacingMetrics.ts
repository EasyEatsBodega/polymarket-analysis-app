/**
 * Pacing Metrics Ingestion Job
 *
 * Fetches daily pacing signals for watchlist titles and release candidates:
 * - Google Trends (US + Global)
 * - Wikipedia pageviews
 * - Computes composite pacing score
 *
 * Runs daily after the main signals job.
 */

import { GeoRegion } from '@prisma/client';
import googleTrends from 'google-trends-api';
import axios from 'axios';

import prisma from '@/lib/prisma';

// Wikipedia API endpoint for pageviews
const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

interface PacingResult {
  titleId: string;
  titleName: string;
  trendsUS: number | null;
  trendsGlobal: number | null;
  wikiViews: number | null;
  pacingScore: number | null;
  date: Date;
}

interface IngestPacingResult {
  titlesProcessed: number;
  metricsCreated: number;
  trendsSuccesses: number;
  trendsFailed: number;
  wikipediaSuccesses: number;
  wikipediaFailed: number;
  errors: string[];
}

/**
 * Get titles to track for pacing:
 * 1. All pinned titles (watchlist)
 * 2. Recent release candidates with status PENDING or MATCHED
 */
async function getTitlesToTrack(): Promise<{ id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' }[]> {
  // Get pinned title IDs
  const pinnedTitles = await prisma.pinnedTitle.findMany({
    select: { titleId: true },
  });

  // Get release candidate title IDs
  const candidates = await prisma.releaseCandidate.findMany({
    where: {
      status: { in: ['PENDING', 'MATCHED'] },
      titleId: { not: null },
    },
    select: { titleId: true },
  });

  // Collect all title IDs
  const allTitleIds = new Set<string>();
  for (const pinned of pinnedTitles) {
    allTitleIds.add(pinned.titleId);
  }
  for (const candidate of candidates) {
    if (candidate.titleId) {
      allTitleIds.add(candidate.titleId);
    }
  }

  if (allTitleIds.size === 0) {
    return [];
  }

  // Fetch actual title data
  const titles = await prisma.title.findMany({
    where: { id: { in: Array.from(allTitleIds) } },
    select: { id: true, canonicalName: true, type: true },
  });

  return titles;
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
    // Get interest over past 7 days
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

    // Calculate 7-day average for stability
    const values = timeline.map((t: { value: number[] }) => t.value?.[0] ?? 0).filter((v: number) => v > 0);
    if (values.length === 0) return null;

    return values.reduce((a: number, b: number) => a + b, 0) / values.length;
  } catch (error) {
    console.warn(`Google Trends error for "${titleName}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch Wikipedia pageviews for a title (7-day average)
 */
async function fetchWikipediaViews(
  titleName: string,
  endDate: Date
): Promise<number | null> {
  try {
    // Format the title for Wikipedia API
    const articleTitle = titleName
      .replace(/\s+/g, '_')
      .replace(/['"]/g, '');

    // Get 7-day range
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

    // Try multiple article name formats
    const suffixes = ['', '_(TV_series)', '_(film)', '_(miniseries)'];

    for (const suffix of suffixes) {
      try {
        const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle + suffix)}/daily/${startStr}/${endStr}`;

        const response = await axios.get(url, {
          headers: {
            'User-Agent': process.env.WIKIPEDIA_USER_AGENT || 'PredictEasy/1.0',
          },
          timeout: 10000,
        });

        const items = response.data?.items;
        if (items && items.length > 0) {
          // Calculate average
          const totalViews = items.reduce((sum: number, item: { views: number }) => sum + item.views, 0);
          return totalViews / items.length;
        }
      } catch {
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
 * Compute composite pacing score (0-100)
 *
 * Weights:
 * - Google Trends US: 40% (most indicative of US audience interest)
 * - Google Trends Global: 30%
 * - Wikipedia (log-normalized): 30%
 */
function computePacingScore(
  trendsUS: number | null,
  trendsGlobal: number | null,
  wikiViews: number | null
): number | null {
  const weights = {
    trendsUS: 0.4,
    trendsGlobal: 0.3,
    wikipedia: 0.3,
  };

  let score = 0;
  let totalWeight = 0;

  // Trends US (already 0-100)
  if (trendsUS !== null) {
    score += trendsUS * weights.trendsUS;
    totalWeight += weights.trendsUS;
  }

  // Trends Global (already 0-100)
  if (trendsGlobal !== null) {
    score += trendsGlobal * weights.trendsGlobal;
    totalWeight += weights.trendsGlobal;
  }

  // Wikipedia (log-normalize: 1K views ≈ 30, 10K ≈ 50, 100K ≈ 70, 1M ≈ 90)
  if (wikiViews !== null && wikiViews > 0) {
    const logNormalized = Math.min(100, Math.max(0, Math.log10(wikiViews) * 20));
    score += logNormalized * weights.wikipedia;
    totalWeight += weights.wikipedia;
  }

  // If we have no data, return null
  if (totalWeight === 0) return null;

  // Normalize to account for missing signals
  return Math.round((score / totalWeight) * 10) / 10;
}

/**
 * Process a single title and fetch all pacing metrics
 */
async function processTitle(
  title: { id: string; canonicalName: string; type: 'SHOW' | 'MOVIE' },
  date: Date,
  results: IngestPacingResult
): Promise<PacingResult> {
  // Fetch Google Trends US
  const trendsUS = await fetchGoogleTrends(title.canonicalName, 'US');
  if (trendsUS !== null) {
    results.trendsSuccesses++;
  } else {
    results.trendsFailed++;
  }

  // Small delay to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Fetch Google Trends Global
  const trendsGlobal = await fetchGoogleTrends(title.canonicalName, '');
  if (trendsGlobal !== null) {
    results.trendsSuccesses++;
  } else {
    results.trendsFailed++;
  }

  // Fetch Wikipedia views
  const wikiViews = await fetchWikipediaViews(title.canonicalName, date);
  if (wikiViews !== null) {
    results.wikipediaSuccesses++;
  } else {
    results.wikipediaFailed++;
  }

  // Compute composite score
  const pacingScore = computePacingScore(trendsUS, trendsGlobal, wikiViews);

  return {
    titleId: title.id,
    titleName: title.canonicalName,
    trendsUS,
    trendsGlobal,
    wikiViews,
    pacingScore,
    date,
  };
}

/**
 * Main ingestion function
 */
export async function ingestPacingMetrics(
  targetDate?: Date
): Promise<IngestPacingResult> {
  const date = targetDate || new Date();
  // Normalize to start of day
  date.setHours(0, 0, 0, 0);

  const results: IngestPacingResult = {
    titlesProcessed: 0,
    metricsCreated: 0,
    trendsSuccesses: 0,
    trendsFailed: 0,
    wikipediaSuccesses: 0,
    wikipediaFailed: 0,
    errors: [],
  };

  try {
    // Get titles to track
    const titles = await getTitlesToTrack();
    console.log(`Found ${titles.length} titles to track for pacing`);

    if (titles.length === 0) {
      results.errors.push('No titles in watchlist or release candidates');
      return results;
    }

    // Process each title
    for (const title of titles) {
      try {
        const pacing = await processTitle(title, date, results);

        // Upsert pacing metrics to database
        await prisma.pacingMetricDaily.upsert({
          where: {
            titleId_date: {
              titleId: pacing.titleId,
              date: pacing.date,
            },
          },
          create: {
            titleId: pacing.titleId,
            date: pacing.date,
            trendsUS: pacing.trendsUS,
            trendsGlobal: pacing.trendsGlobal,
            wikiViews: pacing.wikiViews,
            pacingScore: pacing.pacingScore,
          },
          update: {
            trendsUS: pacing.trendsUS,
            trendsGlobal: pacing.trendsGlobal,
            wikiViews: pacing.wikiViews,
            pacingScore: pacing.pacingScore,
          },
        });
        results.metricsCreated++;
        results.titlesProcessed++;

        // Log progress every 5 titles
        if (results.titlesProcessed % 5 === 0) {
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
export async function runPacingJob(targetDate?: Date): Promise<void> {
  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_pacing_metrics',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting pacing metrics ingestion...');
    const result = await ingestPacingMetrics(targetDate);

    const duration = Date.now() - startTime;
    console.log(`Pacing ingestion complete in ${duration}ms`);
    console.log(`Titles processed: ${result.titlesProcessed}`);
    console.log(`Metrics created: ${result.metricsCreated}`);
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
    console.error('Pacing ingestion failed:', error);

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
  runPacingJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
