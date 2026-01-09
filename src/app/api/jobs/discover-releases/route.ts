/**
 * Netflix Release Discovery Endpoint
 *
 * Triggered by Vercel Cron to discover upcoming Netflix releases from TMDB.
 *
 * Query params:
 * - key: API key for manual triggers
 */

import { NextRequest, NextResponse } from 'next/server';
import { discoverNetflixReleases, matchPendingCandidates } from '@/jobs/discoverNetflixReleases';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';

  // Check if TMDB API key is configured
  if (!process.env.TMDB_API_KEY) {
    return NextResponse.json(
      { error: 'TMDB_API_KEY not configured' },
      { status: 500 }
    );
  }

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'discover_releases',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting Netflix release discovery...');

    // Discover new releases
    const discoveryResult = await discoverNetflixReleases();

    // Also try to match any pending candidates
    const matchResult = await matchPendingCandidates();

    const duration = Date.now() - startTime;

    const combinedResult = {
      ...discoveryResult,
      pendingMatched: matchResult.matched,
      allErrors: [...discoveryResult.errors, ...matchResult.errors],
    };

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: combinedResult.allErrors.length > 0 ? 'FAIL' : 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          ...combinedResult,
        },
      },
    });

    return NextResponse.json({
      success: true,
      durationMs: duration,
      triggeredBy: isManual ? 'manual' : 'cron',
      ...combinedResult,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Release discovery failed:', error);

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
