/**
 * Forecast Generation API Endpoint
 *
 * Triggered by Vercel Cron (daily at 9:30 UTC) or manually.
 * Generates forecasts for all active titles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateForecastsJob } from '@/jobs/generateForecasts';
export const dynamic = 'force-dynamic';
import { MODEL_VERSION } from '@/lib/forecaster';
import prisma from '@/lib/prisma';


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
      jobName: 'generate_forecasts',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting forecast generation via API...');
    const result = await generateForecastsJob();

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
          modelVersion: MODEL_VERSION,
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobRunId: jobRun.id,
      durationMs: duration,
      modelVersion: MODEL_VERSION,
      stats: {
        titlesProcessed: result.titlesProcessed,
        forecastsGenerated: result.forecastsGenerated,
        forecastsSaved: result.forecastsSaved,
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

    console.error('Forecast generation failed:', error);

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
