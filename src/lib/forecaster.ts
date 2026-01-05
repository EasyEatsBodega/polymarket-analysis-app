/**
 * Forecasting Module
 *
 * Generates probabilistic forecasts for Netflix rankings using:
 * - Historical ranking patterns
 * - Signal features (Trends, Wikipedia)
 * - Simple regression models
 */

import { ForecastTarget } from '@prisma/client';
import { SimpleLinearRegression } from 'ml-regression-simple-linear';
import { standardDeviation } from 'simple-statistics';
import { TitleFeatures, buildTitleFeatures, getMomentumWeights } from './featureBuilder';

import prisma from '@/lib/prisma';

// Model version for tracking
export const MODEL_VERSION = '1.0.0';

export interface Forecast {
  titleId: string;
  weekStart: Date;
  weekEnd: Date;
  target: ForecastTarget;
  p10: number;
  p50: number;
  p90: number;
  explain: ForecastExplanation;
}

export interface ForecastExplanation {
  momentumScore: number;
  accelerationScore: number;
  trendsContribution: number | null;
  wikipediaContribution: number | null;
  rankTrendContribution: number | null;
  historicalPattern: string;
  confidence: 'low' | 'medium' | 'high';
}

interface HistoricalDataPoint {
  weekStart: Date;
  rank: number;
  views: number | null;
}

/**
 * Get historical data for a title
 */
async function getHistoricalData(
  titleId: string,
  target: ForecastTarget,
  weeksBack: number = 12
): Promise<HistoricalDataPoint[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeksBack * 7);

  if (target === 'VIEWERSHIP') {
    const data = await prisma.netflixWeeklyGlobal.findMany({
      where: {
        titleId,
        weekStart: { gte: cutoff },
      },
      orderBy: { weekStart: 'asc' },
      select: { weekStart: true, rank: true, views: true },
    });

    return data.map((d) => ({
      weekStart: d.weekStart,
      rank: d.rank,
      views: d.views ? Number(d.views) : null,
    }));
  } else {
    const data = await prisma.netflixWeeklyUS.findMany({
      where: {
        titleId,
        weekStart: { gte: cutoff },
      },
      orderBy: { weekStart: 'asc' },
      select: { weekStart: true, rank: true },
    });

    return data.map((d) => ({
      weekStart: d.weekStart,
      rank: d.rank,
      views: null,
    }));
  }
}

/**
 * Fit a simple linear trend to historical data
 */
function fitLinearTrend(data: HistoricalDataPoint[]): {
  slope: number;
  intercept: number;
  pattern: string;
} {
  if (data.length < 2) {
    return { slope: 0, intercept: data[0]?.rank ?? 5, pattern: 'insufficient_data' };
  }

  // Use week index as X, rank as Y
  const x = data.map((_, i) => i);
  const y = data.map((d) => d.rank);

  const regression = new SimpleLinearRegression(x, y);

  // Determine pattern based on slope
  let pattern: string;
  if (regression.slope < -0.5) {
    pattern = 'climbing_fast';
  } else if (regression.slope < -0.1) {
    pattern = 'climbing_slow';
  } else if (regression.slope > 0.5) {
    pattern = 'falling_fast';
  } else if (regression.slope > 0.1) {
    pattern = 'falling_slow';
  } else {
    pattern = 'stable';
  }

  return {
    slope: regression.slope,
    intercept: regression.coefficients[0],
    pattern,
  };
}

/**
 * Calculate forecast residuals for uncertainty estimation
 */
function calculateResiduals(data: HistoricalDataPoint[]): number {
  if (data.length < 3) return 2; // Default uncertainty

  const ranks = data.map((d) => d.rank);
  return standardDeviation(ranks);
}

/**
 * Adjust forecast based on momentum signals
 */
function applyMomentumAdjustment(
  baseForecast: number,
  features: TitleFeatures | null
): { adjusted: number; contribution: number | null } {
  if (!features) {
    return { adjusted: baseForecast, contribution: null };
  }

  // High momentum suggests rank improvement (lower number)
  // Scale: 50 momentum = neutral, 100 = strong improvement, 0 = strong decline
  const momentumAdjustment = (features.momentumScore - 50) / 50;

  // Apply adjustment: each point of momentum above 50 slightly improves rank
  const adjustment = momentumAdjustment * 1.5;

  return {
    adjusted: baseForecast - adjustment,
    contribution: adjustment,
  };
}

/**
 * Generate forecast for a single title
 */
export async function generateForecast(
  titleId: string,
  targetWeekStart: Date,
  target: ForecastTarget
): Promise<Forecast | null> {
  // Get historical data
  const historical = await getHistoricalData(titleId, target);

  if (historical.length === 0) {
    return null; // No data to forecast from
  }

  // Get current features
  const weights = await getMomentumWeights();
  const latestWeek = historical[historical.length - 1].weekStart;
  const features = await buildTitleFeatures(titleId, latestWeek, weights);

  // Fit trend model
  const trend = fitLinearTrend(historical);

  // Calculate base forecast (next week's predicted rank)
  const nextWeekIndex = historical.length;
  let baseForecast = trend.intercept + trend.slope * nextWeekIndex;

  // Clamp to valid rank range
  baseForecast = Math.max(1, Math.min(10, baseForecast));

  // Apply momentum adjustment
  const { adjusted: adjustedForecast, contribution: momentumContribution } =
    applyMomentumAdjustment(baseForecast, features);

  // Calculate uncertainty
  const residualStd = calculateResiduals(historical);

  // Calculate confidence based on data availability
  const hasSignals = features?.trendsGlobal !== null || features?.wikipediaViews !== null;
  const hasEnoughHistory = historical.length >= 4;
  const confidence: 'low' | 'medium' | 'high' =
    hasEnoughHistory && hasSignals ? 'high' : hasEnoughHistory || hasSignals ? 'medium' : 'low';

  // Generate percentile forecasts
  // For ranks, lower is better so p10 (optimistic) is lower
  const p50 = Math.round(Math.max(1, Math.min(10, adjustedForecast)));
  const p10 = Math.round(Math.max(1, Math.min(10, adjustedForecast - residualStd * 1.28)));
  const p90 = Math.round(Math.max(1, Math.min(10, adjustedForecast + residualStd * 1.28)));

  // Calculate week end
  const weekEnd = new Date(targetWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    titleId,
    weekStart: targetWeekStart,
    weekEnd,
    target,
    p10,
    p50,
    p90,
    explain: {
      momentumScore: features?.momentumScore ?? 0,
      accelerationScore: features?.accelerationScore ?? 0,
      trendsContribution: features?.trendsGlobal ?? null,
      wikipediaContribution: features?.wikipediaViews ?? null,
      rankTrendContribution: momentumContribution,
      historicalPattern: trend.pattern,
      confidence,
    },
  };
}

/**
 * Generate view forecasts (for global views target)
 */
export async function generateViewsForecast(
  titleId: string,
  targetWeekStart: Date
): Promise<Forecast | null> {
  const historical = await getHistoricalData(titleId, 'VIEWERSHIP');

  const viewsData = historical.filter((d) => d.views !== null && d.views > 0);

  if (viewsData.length < 2) {
    return null;
  }

  // Get current features
  const weights = await getMomentumWeights();
  const latestWeek = historical[historical.length - 1].weekStart;
  const features = await buildTitleFeatures(titleId, latestWeek, weights);

  // Fit trend on log views (views tend to decay exponentially)
  const x = viewsData.map((_, i) => i);
  const y = viewsData.map((d) => Math.log(d.views!));

  const regression = new SimpleLinearRegression(x, y);

  // Predict next week's log views
  const nextWeekIndex = viewsData.length;
  let logViewsForecast = regression.coefficients[0] + regression.slope * nextWeekIndex;

  // Apply momentum adjustment to log views
  if (features) {
    const momentumFactor = 1 + (features.momentumScore - 50) / 200;
    logViewsForecast += Math.log(momentumFactor);
  }

  // Convert back to views
  const viewsForecast = Math.exp(logViewsForecast);

  // Calculate uncertainty from residuals
  const residuals = viewsData.map((d, i) => {
    const predicted = regression.coefficients[0] + regression.slope * i;
    return Math.log(d.views!) - predicted;
  });
  const residualStd = standardDeviation(residuals);

  // Generate percentile forecasts
  const p50 = Math.round(viewsForecast);
  const p10 = Math.round(Math.exp(logViewsForecast + residualStd * 1.28)); // Higher views is optimistic
  const p90 = Math.round(Math.exp(logViewsForecast - residualStd * 1.28)); // Lower views is pessimistic

  const weekEnd = new Date(targetWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Determine pattern
  let pattern: string;
  if (regression.slope > 0.1) {
    pattern = 'growing';
  } else if (regression.slope < -0.1) {
    pattern = 'declining';
  } else {
    pattern = 'stable';
  }

  const confidence: 'low' | 'medium' | 'high' = viewsData.length >= 6 ? 'high' : viewsData.length >= 3 ? 'medium' : 'low';

  return {
    titleId,
    weekStart: targetWeekStart,
    weekEnd,
    target: 'VIEWERSHIP',
    p10,
    p50,
    p90,
    explain: {
      momentumScore: features?.momentumScore ?? 0,
      accelerationScore: features?.accelerationScore ?? 0,
      trendsContribution: features?.trendsGlobal ?? null,
      wikipediaContribution: features?.wikipediaViews ?? null,
      rankTrendContribution: null,
      historicalPattern: pattern,
      confidence,
    },
  };
}

/**
 * Generate forecasts for all active titles
 */
export async function generateAllForecasts(
  targetWeekStart: Date
): Promise<{ forecasts: Forecast[]; errors: string[] }> {
  const forecasts: Forecast[] = [];
  const errors: string[] = [];

  // Get all titles with recent data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { weeklyGlobal: { some: { weekStart: { gte: thirtyDaysAgo } } } },
        { weeklyUS: { some: { weekStart: { gte: thirtyDaysAgo } } } },
      ],
    },
    select: { id: true, canonicalName: true, type: true },
  });

  console.log(`Generating forecasts for ${titles.length} titles...`);

  for (const title of titles) {
    try {
      // Generate US rank forecast
      const usRankForecast = await generateForecast(title.id, targetWeekStart, 'RANK');
      if (usRankForecast) {
        forecasts.push(usRankForecast);
      }

      // Generate global views forecast
      const viewsForecast = await generateViewsForecast(title.id, targetWeekStart);
      if (viewsForecast) {
        forecasts.push(viewsForecast);
      }
    } catch (error) {
      errors.push(
        `Error forecasting ${title.canonicalName}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  return { forecasts, errors };
}

/**
 * Save forecasts to database
 */
export async function saveForecasts(forecasts: Forecast[]): Promise<number> {
  let saved = 0;

  for (const forecast of forecasts) {
    try {
      await prisma.forecastWeekly.upsert({
        where: {
          titleId_weekStart_target: {
            titleId: forecast.titleId,
            weekStart: forecast.weekStart,
            target: forecast.target,
          },
        },
        create: {
          titleId: forecast.titleId,
          weekStart: forecast.weekStart,
          weekEnd: forecast.weekEnd,
          target: forecast.target,
          p10: forecast.p10,
          p50: forecast.p50,
          p90: forecast.p90,
          modelVersion: MODEL_VERSION,
          explainJson: forecast.explain as object,
        },
        update: {
          weekEnd: forecast.weekEnd,
          p10: forecast.p10,
          p50: forecast.p50,
          p90: forecast.p90,
          explainJson: forecast.explain as object,
        },
      });
      saved++;
    } catch (error) {
      console.error(`Failed to save forecast for ${forecast.titleId}:`, error);
    }
  }

  return saved;
}
