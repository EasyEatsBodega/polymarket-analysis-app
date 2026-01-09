/**
 * Netflix Weekly Data Ingestion API Endpoint
 *
 * Triggered by Vercel Cron (Sundays at 10:00 UTC) or manually.
 * Downloads and processes Netflix Top 10 data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestNetflixWeekly } from '@/jobs/ingestNetflixWeekly';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large data processing

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';

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
