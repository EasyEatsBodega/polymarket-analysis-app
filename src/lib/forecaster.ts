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
import { TitleFeatures, buildTitleFeatures, getMomentumWeights, MomentumBreakdown } from './featureBuilder';

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
  momentumBreakdown: MomentumBreakdown | null;
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
    // Try US data first
    const usData = await prisma.netflixWeeklyUS.findMany({
      where: {
        titleId,
        weekStart: { gte: cutoff },
      },
      orderBy: { weekStart: 'asc' },
      select: { weekStart: true, rank: true },
    });

    if (usData.length > 0) {
      return usData.map((d) => ({
        weekStart: d.weekStart,
        rank: d.rank,
        views: null,
      }));
    }

    // Fall back to global data for RANK forecasts
    const globalData = await prisma.netflixWeeklyGlobal.findMany({
      where: {
        titleId,
        weekStart: { gte: cutoff },
      },
      orderBy: { weekStart: 'asc' },
      select: { weekStart: true, rank: true },
    });

    return globalData.map((d) => ({
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
      momentumBreakdown: features?.momentumBreakdown ?? null,
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
      momentumBreakdown: features?.momentumBreakdown ?? null,
    },
  };
}

/**
 * Generate pre-release forecast for titles without Netflix history
 * Uses signal data (Google Trends, Wikipedia) to estimate potential ranking
 * Falls back to neutral defaults if no signals available
 */
export async function generatePreReleaseForecast(
  titleId: string,
  targetWeekStart: Date
): Promise<Forecast | null> {
  // Get recent signals for this title (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const signals = await prisma.dailySignal.findMany({
    where: {
      titleId,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { date: 'desc' },
  });

  // Calculate average signal values
  const trendsSignals = signals.filter(s => s.source === 'TRENDS');
  const wikiSignals = signals.filter(s => s.source === 'WIKIPEDIA');

  const avgTrends = trendsSignals.length > 0
    ? trendsSignals.reduce((sum, s) => sum + s.value, 0) / trendsSignals.length
    : null;

  const avgWiki = wikiSignals.length > 0
    ? wikiSignals.reduce((sum, s) => sum + s.value, 0) / wikiSignals.length
    : null;

  // Calculate momentum score from signals (no rank data)
  const weights = await getMomentumWeights();
  let momentumScore = 50; // Default neutral
  let confidence: 'low' | 'medium' | 'high' = 'low'; // Default to low if no signals

  if (avgTrends !== null || avgWiki !== null) {
    let score = 0;
    let totalWeight = 0;

    if (avgTrends !== null) {
      // Google Trends is already 0-100
      score += avgTrends * weights.trendsWeight;
      totalWeight += weights.trendsWeight;
    }

    if (avgWiki !== null && avgWiki > 0) {
      // Normalize Wikipedia views using log scale
      const logNormalized = Math.min(100, Math.log10(avgWiki) * 10);
      score += logNormalized * weights.wikipediaWeight;
      totalWeight += weights.wikipediaWeight;
    }

    if (totalWeight > 0) {
      momentumScore = Math.round(score / totalWeight);
      confidence = 'medium'; // Medium confidence if we have signals
    }
  }

  // Estimate rank potential based on momentum
  // High momentum (80+) suggests strong #1 potential
  // Low momentum (<40) suggests unlikely to chart high
  let predictedRank: number;
  if (momentumScore >= 80) {
    predictedRank = 1;
  } else if (momentumScore >= 70) {
    predictedRank = 2;
  } else if (momentumScore >= 60) {
    predictedRank = 3;
  } else if (momentumScore >= 50) {
    predictedRank = 5;
  } else if (momentumScore >= 40) {
    predictedRank = 7;
  } else {
    predictedRank = 9;
  }

  // Calculate uncertainty - higher for pre-release (less data)
  // Even higher if no signals available
  const uncertainty = signals.length > 0 ? 2.5 : 3.5;

  // Generate percentile forecasts
  const p50 = predictedRank;
  const p10 = Math.max(1, Math.round(predictedRank - uncertainty));
  const p90 = Math.min(10, Math.round(predictedRank + uncertainty));

  const weekEnd = new Date(targetWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    titleId,
    weekStart: targetWeekStart,
    weekEnd,
    target: 'RANK',
    p10,
    p50,
    p90,
    explain: {
      momentumScore,
      accelerationScore: 0, // No historical momentum to compare
      trendsContribution: avgTrends,
      wikipediaContribution: avgWiki,
      rankTrendContribution: null,
      historicalPattern: 'pre_release',
      confidence,
      momentumBreakdown: null,
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

  // Get all titles with recent Netflix data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const netflixTitles = await prisma.title.findMany({
    where: {
      OR: [
        { weeklyGlobal: { some: { weekStart: { gte: thirtyDaysAgo } } } },
        { weeklyUS: { some: { weekStart: { gte: thirtyDaysAgo } } } },
      ],
    },
    select: { id: true, canonicalName: true, type: true },
  });

  console.log(`Generating forecasts for ${netflixTitles.length} Netflix titles...`);

  for (const title of netflixTitles) {
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

  // Get Polymarket titles that need pre-release forecasts
  // This includes:
  // 1. Titles with polymarket ID and NO Netflix data at all (pre-release)
  // 2. Titles with polymarket ID and only OLD Netflix data (returning/new season)
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: {
        some: { provider: 'polymarket' },
      },
      // Exclude titles that have RECENT Netflix data (they're already forecast above)
      AND: [
        { weeklyGlobal: { none: { weekStart: { gte: thirtyDaysAgo } } } },
        { weeklyUS: { none: { weekStart: { gte: thirtyDaysAgo } } } },
      ],
    },
    select: { id: true, canonicalName: true, type: true },
  });

  console.log(`Generating pre-release forecasts for ${polymarketTitles.length} Polymarket titles...`);

  for (const title of polymarketTitles) {
    try {
      const preReleaseForecast = await generatePreReleaseForecast(title.id, targetWeekStart);
      if (preReleaseForecast) {
        forecasts.push(preReleaseForecast);
      }
    } catch (error) {
      errors.push(
        `Error forecasting pre-release ${title.canonicalName}: ${error instanceof Error ? error.message : error}`
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
