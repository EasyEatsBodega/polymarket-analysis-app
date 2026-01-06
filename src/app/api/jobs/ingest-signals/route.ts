/**
 * Daily Signals Ingestion API Endpoint
 *
 * Triggered by Vercel Cron or manually.
 * Uses chunked processing to work within Vercel's timeout limits.
 *
 * Query params:
 * - batchSize: Number of titles to process per request (default: 5)
 * - offset: Starting index for batch processing (default: 0)
 * - date: Target date for signals (default: today)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestSignalsForTitles, getActiveTitlesForSignals } from '@/jobs/ingestDailySignals';
export const dynamic = 'force-dynamic';
import prisma from '@/lib/prisma';

// Default batch size - process 5 titles per request to stay within timeout
const DEFAULT_BATCH_SIZE = 5;

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

  // Parse query parameters
  const batchSize = parseInt(request.nextUrl.searchParams.get('batchSize') || String(DEFAULT_BATCH_SIZE));
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');
  const dateParam = request.nextUrl.searchParams.get('date');
  const targetDate = dateParam ? new Date(dateParam) : new Date();

  const startTime = Date.now();

  try {
    // Get all active titles
    const allTitles = await getActiveTitlesForSignals();
    const totalTitles = allTitles.length;

    // Get batch to process
    const titlesToProcess = allTitles.slice(offset, offset + batchSize);

    if (titlesToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No more titles to process',
        stats: {
          totalTitles,
          processed: 0,
          offset,
          batchSize,
          isComplete: true,
        },
      });
    }

    console.log(`Processing batch: titles ${offset + 1}-${offset + titlesToProcess.length} of ${totalTitles}`);

    // Process this batch
    const result = await ingestSignalsForTitles(titlesToProcess, targetDate);

    const duration = Date.now() - startTime;
    const nextOffset = offset + batchSize;
    const isComplete = nextOffset >= totalTitles;

    // Log progress
    await prisma.jobRun.create({
      data: {
        jobName: 'ingest_signals_batch',
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          triggeredBy: isManual ? 'manual' : 'cron',
          targetDate: targetDate.toISOString(),
          batch: { offset, batchSize, totalTitles },
          ...result,
          errors: result.errors.slice(0, 20),
        },
      },
    });

    return NextResponse.json({
      success: true,
      durationMs: duration,
      targetDate: targetDate.toISOString(),
      stats: {
        totalTitles,
        batchProcessed: titlesToProcess.length,
        offset,
        nextOffset: isComplete ? null : nextOffset,
        isComplete,
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
      // Include next URL for easy chaining
      nextUrl: isComplete ? null : `/api/jobs/ingest-signals?offset=${nextOffset}&batchSize=${batchSize}${dateParam ? `&date=${dateParam}` : ''}`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Signals ingestion batch failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        durationMs: duration,
        stats: { offset, batchSize },
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
