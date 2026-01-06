/**
 * Polymarket Sync API Endpoint
 *
 * Triggered by Vercel Cron (every 12 hours) or manually.
 * Syncs Polymarket markets and price data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncPolymarket } from '@/jobs/syncPolymarket';
export const dynamic = 'force-dynamic';
import prisma from '@/lib/prisma';


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
  const apiKey = request.nextUrl.searchParams.get('key');
  const isManual = apiKey === process.env.ADMIN_API_KEY;
  const pricesOnly = request.nextUrl.searchParams.get('pricesOnly') === 'true';

  if (!isManual && !verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
