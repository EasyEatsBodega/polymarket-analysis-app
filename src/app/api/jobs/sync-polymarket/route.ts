/**
 * Polymarket Sync API Endpoint
 *
 * Triggered by Vercel Cron (every 12 hours) or manually.
 * Syncs Polymarket markets and price data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncPolymarket } from '@/jobs/syncPolymarket';
import { ingestNetflixRatings } from '@/jobs/ingestNetflixRatings';
import { generateForecastsJob } from '@/jobs/generateForecasts';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';
  const pricesOnly = request.nextUrl.searchParams.get('pricesOnly') === 'true';

  const startTime = Date.now();

  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: pricesOnly ? 'polymarket_prices' : 'polymarket_sync',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting Polymarket sync via API...');
    const result = await syncPolymarket(pricesOnly);

    // After sync, fetch ratings for any new Netflix titles
    let ratingsResult = null;
    let forecastResult = null;
    if (!pricesOnly) {
      console.log('Fetching ratings for Netflix market titles...');
      try {
        ratingsResult = await ingestNetflixRatings();
      } catch (ratingsError) {
        console.error('Ratings ingestion failed (non-fatal):', ratingsError);
      }

      // Generate forecasts for all Polymarket titles
      console.log('Generating forecasts for all Polymarket titles...');
      try {
        forecastResult = await generateForecastsJob();
        console.log(`Generated ${forecastResult.forecastsGenerated} forecasts for ${forecastResult.titlesProcessed} titles`);
      } catch (forecastError) {
        console.error('Forecast generation failed (non-fatal):', forecastError);
      }
    }

    const duration = Date.now() - startTime;

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          pricesOnly,
          ...result,
          errors: result.errors.slice(0, 100),
          ratingsIngested: ratingsResult,
          forecastsGenerated: forecastResult,
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobRunId: jobRun.id,
      durationMs: duration,
      stats: {
        titlesCreated: result.titlesCreated,
        marketsDiscovered: result.marketsDiscovered,
        marketsCreated: result.marketsCreated,
        marketsUpdated: result.marketsUpdated,
        priceSnapshots: result.priceSnapshots,
        titleLinksCreated: result.titleLinksCreated,
        errorCount: result.errors.length,
      },
      ratingsIngested: ratingsResult,
      forecastsGenerated: forecastResult ? {
        titlesProcessed: forecastResult.titlesProcessed,
        forecastsGenerated: forecastResult.forecastsGenerated,
        forecastsSaved: forecastResult.forecastsSaved,
      } : null,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: errorMessage,
        detailsJson: { durationMs: duration, triggeredBy: isManual ? 'manual' : 'cron' },
      },
    });

    console.error('Polymarket sync failed:', error);

    return NextResponse.json(
      { success: false, jobRunId: jobRun.id, error: errorMessage, durationMs: duration },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
