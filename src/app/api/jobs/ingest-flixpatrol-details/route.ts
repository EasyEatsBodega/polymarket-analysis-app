/**
 * FlixPatrol Details Ingestion Endpoint
 *
 * Fetches trailer and social data for Polymarket-linked titles.
 * Scheduled to run every 48 hours via Vercel Cron.
 *
 * Query params:
 * - key: API key for manual triggers
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestFlixPatrolDetails } from '@/jobs/ingestFlixPatrolDetails';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for processing all Polymarket titles

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_flixpatrol_details',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting FlixPatrol details ingestion...');

    const result = await ingestFlixPatrolDetails();
    const duration = Date.now() - startTime;

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: result.errors.length > 0 ? 'FAIL' : 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          ...result,
        },
      },
    });

    return NextResponse.json({
      success: true,
      durationMs: duration,
      triggeredBy: isManual ? 'manual' : 'cron',
      ...result,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('FlixPatrol details ingestion failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: errorMessage,
        detailsJson: { durationMs: duration },
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
