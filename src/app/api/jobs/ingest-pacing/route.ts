/**
 * Pacing Metrics Ingestion API Endpoint
 *
 * Triggered by Vercel Cron (daily at 10:00 UTC) or manually.
 * Fetches pacing signals for watchlist titles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestPacingMetrics } from '@/jobs/ingestPacingMetrics';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';

  // Optional date parameter for backfilling
  const dateParam = request.nextUrl.searchParams.get('date');
  const targetDate = dateParam ? new Date(dateParam) : undefined;

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_pacing_metrics',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting pacing metrics ingestion via API...');
    const result = await ingestPacingMetrics(targetDate);

    const duration = Date.now() - startTime;

    // Update job run with success
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          targetDate: targetDate?.toISOString() || new Date().toISOString(),
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobRunId: jobRun.id,
      durationMs: duration,
      targetDate: targetDate?.toISOString() || new Date().toISOString(),
      stats: {
        titlesProcessed: result.titlesProcessed,
        metricsCreated: result.metricsCreated,
        trends: {
          successes: result.trendsSuccesses,
          failed: result.trendsFailed,
        },
        wikipedia: {
          successes: result.wikipediaSuccesses,
          failed: result.wikipediaFailed,
        },
        errorCount: result.errors.length,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update job run with failure
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: errorMessage,
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
        },
      },
    });

    console.error('Pacing ingestion failed:', error);

    return NextResponse.json(
      {
        success: false,
        jobRunId: jobRun.id,
        error: errorMessage,
        durationMs: duration,
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// POST endpoint for webhook-style triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
