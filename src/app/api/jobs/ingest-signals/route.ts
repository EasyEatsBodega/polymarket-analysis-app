/**
 * Daily Signals Ingestion API Endpoint
 *
 * Triggered by Vercel Cron (daily at 9:00 UTC) or manually.
 * Fetches Google Trends and Wikipedia signals for active titles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestDailySignals } from '@/jobs/ingestDailySignals';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Skip verification in development or if no secret is set
  if (!cronSecret || process.env.NODE_ENV === 'development') {
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Check for manual trigger with API key
  const apiKey = request.nextUrl.searchParams.get('key');
  const isManual = apiKey === process.env.ADMIN_API_KEY;

  if (!isManual && !verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Optional date parameter for backfilling
  const dateParam = request.nextUrl.searchParams.get('date');
  const targetDate = dateParam ? new Date(dateParam) : new Date();

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_daily_signals',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting daily signals ingestion via API...');
    const result = await ingestDailySignals(targetDate);

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
          targetDate: targetDate.toISOString(),
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobRunId: jobRun.id,
      durationMs: duration,
      targetDate: targetDate.toISOString(),
      stats: {
        titlesProcessed: result.titlesProcessed,
        signalsCreated: result.signalsCreated,
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

    console.error('Signals ingestion failed:', error);

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
