/**
 * Forecast Generation Job
 *
 * Runs daily to generate forecasts for upcoming week.
 * Uses feature data and historical patterns.
 */

import { PrismaClient } from '@prisma/client';
import { generateAllForecasts, saveForecasts, MODEL_VERSION } from '../lib/forecaster';

const prisma = new PrismaClient();

interface ForecastJobResult {
  forecastsGenerated: number;
  forecastsSaved: number;
  titlesProcessed: number;
  errors: string[];
}

/**
 * Get the start of next week (Sunday)
 */
function getNextWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;

  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(0, 0, 0, 0);

  return nextSunday;
}

/**
 * Main job function
 */
export async function generateForecastsJob(): Promise<ForecastJobResult> {
  const result: ForecastJobResult = {
    forecastsGenerated: 0,
    forecastsSaved: 0,
    titlesProcessed: 0,
    errors: [],
  };

  try {
    // Target next week for forecasts
    const targetWeekStart = getNextWeekStart();
    console.log(`Generating forecasts for week starting ${targetWeekStart.toISOString().split('T')[0]}`);

    // Generate all forecasts
    const { forecasts, errors } = await generateAllForecasts(targetWeekStart);
    result.forecastsGenerated = forecasts.length;
    result.errors.push(...errors);

    // Count unique titles
    const uniqueTitles = new Set(forecasts.map((f) => f.titleId));
    result.titlesProcessed = uniqueTitles.size;

    // Save forecasts
    result.forecastsSaved = await saveForecasts(forecasts);

    console.log(`Generated ${result.forecastsGenerated} forecasts for ${result.titlesProcessed} titles`);
    console.log(`Saved ${result.forecastsSaved} forecasts to database`);
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  return result;
}

/**
 * Run job with logging
 */
export async function runForecastJob(): Promise<void> {
  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'generate_forecasts',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting forecast generation...');
    const result = await generateForecastsJob();

    const duration = Date.now() - startTime;
    console.log(`Forecast generation complete in ${duration}ms`);

    if (result.errors.length > 0) {
      console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 10));
    }

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          modelVersion: MODEL_VERSION,
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Forecast generation failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        detailsJson: { durationMs: duration },
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly
if (require.main === module) {
  runForecastJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
