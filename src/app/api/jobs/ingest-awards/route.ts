/**
 * Awards Ingestion API Endpoint
 *
 * Triggered by Vercel Cron (every 4 hours) or manually.
 * Fetches and syncs award show odds from Polymarket.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestAwardsPolymarket } from '@/jobs/ingestAwardsPolymarket';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
      jobName: 'ingest_awards_polymarket',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting awards ingestion via API...');
    const result = await ingestAwardsPolymarket();

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
        showsProcessed: result.showsProcessed,
        categoriesFound: result.categoriesFound,
        categoriesCreated: result.categoriesCreated,
        nomineesCreated: result.nomineesCreated,
        oddsUpdated: result.oddsUpdated,
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

    console.error('Awards ingestion failed:', error);

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
