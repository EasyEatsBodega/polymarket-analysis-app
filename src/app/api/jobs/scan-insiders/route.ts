/**
 * Insider Scan Cron Job Endpoint
 *
 * Triggered by Vercel Cron to scan for new insider wallets.
 *
 * Query params:
 * - daysBack: Number of days to scan (default: 30)
 * - minTradeSize: Minimum trade size in USD (default: 500)
 * - maxTrades: Maximum trades per wallet (default: 5)
 * - key: API key for manual triggers
 */

import { NextRequest, NextResponse } from 'next/server';
import { scanInsiders } from '@/jobs/scanInsiders';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse options - default to 90 days to support all timeframe filters
  const daysBack = parseInt(request.nextUrl.searchParams.get('daysBack') || '90');
  const minTradeSize = parseInt(request.nextUrl.searchParams.get('minTradeSize') || '500');
  const maxTrades = parseInt(request.nextUrl.searchParams.get('maxTrades') || '5');

  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'scan_insiders',
      status: 'RUNNING',
    },
  });

  try {
    console.log(`Starting insider scan (daysBack=${daysBack}, minTradeSize=${minTradeSize}, maxTrades=${maxTrades})...`);

    const result = await scanInsiders({
      daysBack,
      minTradeSize,
      maxTrades,
    });

    const duration = Date.now() - startTime;

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          options: { daysBack, minTradeSize, maxTrades },
          ...result,
          errors: result.errors.slice(0, 50),
        },
      },
    });

    return NextResponse.json({
      success: true,
      durationMs: duration,
      triggeredBy: isManual ? 'manual' : 'cron',
      options: { daysBack, minTradeSize, maxTrades },
      stats: {
        walletsScanned: result.walletsScanned,
        walletsQualified: result.walletsQualified,
        walletsCreated: result.walletsCreated,
        walletsUpdated: result.walletsUpdated,
        tradesRecorded: result.tradesRecorded,
        badgesAwarded: result.badgesAwarded,
        errorCount: result.errors.length,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Insider scan failed:', error);

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

// POST endpoint for webhook-style triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
