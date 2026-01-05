/**
 * Netflix Weekly Data Ingestion API Endpoint
 *
 * Triggered by Vercel Cron (Sundays at 10:00 UTC) or manually.
 * Downloads and processes Netflix Top 10 data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestNetflixWeekly } from '@/jobs/ingestNetflixWeekly';
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

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_netflix_weekly',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting Netflix weekly data ingestion via API...');
    const result = await ingestNetflixWeekly();

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
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobRunId: jobRun.id,
      durationMs: duration,
      stats: {
        globalRowsProcessed: result.globalRowsProcessed,
        usRowsProcessed: result.usRowsProcessed,
        titlesCreated: result.titlesCreated,
        globalRecordsUpserted: result.globalRecordsUpserted,
        usRecordsUpserted: result.usRecordsUpserted,
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

    console.error('Netflix ingestion failed:', error);

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
