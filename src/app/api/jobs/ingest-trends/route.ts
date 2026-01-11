/**
 * Google Trends Ingestion API Endpoint
 *
 * Fetches Google Trends data for Polymarket Netflix titles.
 * Provides a leading indicator for predicting new entrant competition.
 *
 * Triggered by Vercel Cron or manually.
 *
 * GET /api/jobs/ingest-trends
 * POST /api/jobs/ingest-trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestGoogleTrends } from '@/jobs/ingestGoogleTrends';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this job

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';

  const startTime = Date.now();

  try {
    console.log('Starting Google Trends ingestion...');

    const result = await ingestGoogleTrends();

    const duration = Date.now() - startTime;

    // Log job run
    await prisma.jobRun.create({
      data: {
        jobName: 'ingest_google_trends',
        status: result.errors.length === 0 ? 'SUCCESS' : 'FAIL',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          titlesProcessed: result.titlesProcessed,
          signalsSaved: result.signalsSaved,
          topComparisons: result.comparisons.slice(0, 5),
          errors: result.errors.slice(0, 20),
        },
      },
    });

    return NextResponse.json({
      success: result.errors.length === 0,
      durationMs: duration,
      stats: {
        titlesProcessed: result.titlesProcessed,
        signalsSaved: result.signalsSaved,
        errorCount: result.errors.length,
      },
      // Top titles by Google Trends momentum
      topByMomentum: result.comparisons.slice(0, 10).map((c) => ({
        name: c.name,
        trendsUS: c.avgTrendsUS,
        trendsGlobal: c.avgTrendsGlobal,
        trend: c.trend,
        momentum: c.momentum,
      })),
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Google Trends ingestion failed:', error);

    // Log failed job
    await prisma.jobRun.create({
      data: {
        jobName: 'ingest_google_trends',
        status: 'FAIL',
        finishedAt: new Date(),
        error: errorMessage,
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
        },
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        durationMs: duration,
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
