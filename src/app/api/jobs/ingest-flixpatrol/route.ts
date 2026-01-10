/**
 * FlixPatrol Daily Rankings Ingestion Endpoint
 *
 * Triggered by Vercel Cron to fetch daily Netflix Top 10 from FlixPatrol API.
 * Falls back to HTML scraping if API fails.
 *
 * Query params:
 * - date: Optional date to ingest (YYYY-MM-DD format)
 * - key: API key for manual triggers
 * - method: 'api' (default) or 'scrape' to force method
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestFlixPatrolAPI } from '@/jobs/ingestFlixPatrolAPI';
import { ingestFlixPatrol } from '@/jobs/ingestFlixPatrol';
import prisma from '@/lib/prisma';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute should be plenty

export async function GET(request: NextRequest) {
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const isManual = auth.triggeredBy === 'manual';

  const dateParam = request.nextUrl.searchParams.get('date') || undefined;
  // Default to 'scrape' since API doesn't support worldwide filtering
  const methodParam = request.nextUrl.searchParams.get('method') || 'scrape';
  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_flixpatrol',
      status: 'RUNNING',
    },
  });

  try {
    console.log(`Starting FlixPatrol ingestion (method: ${methodParam})...`);

    let result;
    let usedMethod = methodParam;

    // Try API first, fall back to scraping if API fails
    if (methodParam === 'api' && process.env.FLIXPATROL_API_KEY) {
      try {
        result = await ingestFlixPatrolAPI(dateParam);
      } catch (apiError) {
        console.warn('API method failed, falling back to scraping:', apiError);
        result = await ingestFlixPatrol(dateParam);
        usedMethod = 'scrape-fallback';
      }
    } else {
      result = await ingestFlixPatrol(dateParam);
      usedMethod = 'scrape';
    }
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
          method: usedMethod,
          ...result,
        },
      },
    });

    return NextResponse.json({
      success: true,
      durationMs: duration,
      triggeredBy: isManual ? 'manual' : 'cron',
      method: usedMethod,
      ...result,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('FlixPatrol ingestion failed:', error);

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
