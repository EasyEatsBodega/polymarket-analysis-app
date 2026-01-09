/**
 * Forecasting Module
 *
 * Generates probabilistic forecasts for Netflix rankings using:
 * - Historical ranking patterns
 * - Signal features (Trends, Wikipedia)
 * - Simple regression models
 */

import { ForecastTarget, Prisma } from '@prisma/client';
import { SimpleLinearRegression } from 'ml-regression-simple-linear';
import { standardDeviation } from 'simple-statistics';
import { TitleFeatures, buildTitleFeatures, getMomentumWeights, MomentumBreakdown } from './featureBuilder';
import { getCreatorMomentumBoost } from './creatorTrackRecord';
import { generateMarketThesis } from './marketThesis';

import prisma from '@/lib/prisma';

// Define Prisma types for properly typed queries
type NetflixWeeklyGlobalSelect = Prisma.NetflixWeeklyGlobalGetPayload<{
  select: { weekStart: true; rank: true; views: true };
}>;
type NetflixWeeklyUSSelect = Prisma.NetflixWeeklyUSGetPayload<{
  select: { weekStart: true; rank: true };
}>;
type NetflixWeeklyGlobalRankSelect = Prisma.NetflixWeeklyGlobalGetPayload<{
  select: { weekStart: true; rank: true };
}>;
type DailySignalResult = Prisma.DailySignalGetPayload<{}>;

// Model version for tracking
// v1.1.0: Enhanced pre-release model with creator track record + star power
// v1.2.0: Added FlixPatrol daily rank integration for current performance
export const MODEL_VERSION = '1.2.0';

/**
 * Get the most recent FlixPatrol daily rank for a title
 * Returns rank 1-10 if currently charting, null otherwise
 */
async function getLatestFlixPatrolRank(titleId: string): Promise<{
  rank: number;
  date: Date;
  region: string;
} | null> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Get most recent FlixPatrol daily entry for this title
  const latest = await prisma.flixPatrolDaily.findFirst({
    where: {
      titleId,
      date: { gte: threeDaysAgo },
    },
    orderBy: { date: 'desc' },
    select: { rank: true, date: true, region: true },
  });

  if (latest && latest.rank <= 10) {
    return {
      rank: latest.rank,
      date: latest.date,
      region: latest.region,
    };
  }

  return null;
}

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
  // New fields for enhanced pre-release forecasting
  creatorBoost?: number;
  creatorName?: string;
  creatorReason?: string;
  starPowerBoost?: number;
  starPowerScore?: number;
  // FlixPatrol current ranking
  currentFlixPatrolRank?: number;
  currentFlixPatrolDate?: string;
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

    return data.map((d: NetflixWeeklyGlobalSelect) => ({
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
      return usData.map((d: NetflixWeeklyUSSelect) => ({
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

    return globalData.map((d: NetflixWeeklyGlobalRankSelect) => ({
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
 *
 * ENHANCED MODEL (v1.1):
 * Uses multiple factors weighted by predictive power:
 * - Creator track record (30%): Harlan Coben = 90% #1 hit rate
 * - Star power (25%): A-list cast significantly boosts viewership
 * - Google Trends (20%): Pre-release search interest
 * - Wikipedia views (15%): Article traffic as buzz indicator
 * - Base rate (10%): Default expectation for new releases
 *
 * Falls back to neutral defaults if no signals available.
 */
export async function generatePreReleaseForecast(
  titleId: string,
  targetWeekStart: Date
): Promise<Forecast | null> {
  // Get title info for thesis generation
  const title = await prisma.title.findUnique({
    where: { id: titleId },
    select: { canonicalName: true, type: true },
  });

  if (!title) return null;

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
  const trendsSignals = signals.filter((s: DailySignalResult) => s.source === 'TRENDS');
  const wikiSignals = signals.filter((s: DailySignalResult) => s.source === 'WIKIPEDIA');

  const avgTrends = trendsSignals.length > 0
    ? trendsSignals.reduce((sum: number, s: DailySignalResult) => sum + s.value, 0) / trendsSignals.length
    : null;

  const avgWiki = wikiSignals.length > 0
    ? wikiSignals.reduce((sum: number, s: DailySignalResult) => sum + s.value, 0) / wikiSignals.length
    : null;

  // === NEW: Get creator track record boost ===
  const creatorInfo = getCreatorMomentumBoost(title.canonicalName);

  // === NEW: Get current FlixPatrol daily rank ===
  // If a title is ALREADY charting, this is the strongest signal
  const currentFlixPatrol = await getLatestFlixPatrolRank(titleId);

  // === NEW: Get star power from MarketThesis ===
  let starPowerScore = 50; // Default neutral
  try {
    const thesis = await generateMarketThesis(
      title.canonicalName,
      title.type as 'MOVIE' | 'SHOW',
      { trendsScore: avgTrends ?? undefined }
    );
    starPowerScore = thesis.starPowerScore;
  } catch (error) {
    console.error(`[generatePreReleaseForecast] Failed to get star power for ${title.canonicalName}:`, error);
  }

  // === ENHANCED MOMENTUM CALCULATION ===
  // If title is ALREADY charting on FlixPatrol, use that as primary signal
  // Otherwise use weighted model of other factors

  let momentumScore: number;
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (currentFlixPatrol) {
    // TITLE IS ALREADY CHARTING - this is the strongest signal!
    // Convert rank to momentum: #1 = 100, #2 = 95, #3 = 90, etc.
    momentumScore = 100 - (currentFlixPatrol.rank - 1) * 5;
    momentumScore = Math.max(50, momentumScore); // Floor at 50 for any charting title
    confidence = 'high'; // Actually charting = high confidence
    console.log(`[generatePreReleaseForecast] ${title.canonicalName} is currently #${currentFlixPatrol.rank} on FlixPatrol (${currentFlixPatrol.region})`);
  } else {
    // Not currently charting - use weighted model
    const weights = {
      creatorTrackRecord: 0.30,  // Creator history is THE biggest predictor
      starPower: 0.25,           // A-list cast draws viewers
      trends: 0.20,              // Pre-release search interest
      wikipedia: 0.15,           // Article traffic
      baseRate: 0.10,            // Default expectation
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Creator track record (most important signal)
    if (creatorInfo.boost > 0) {
      // Creator boost is 0-45 based on hit rate, scale to 0-100
      const creatorScore = Math.min(100, (creatorInfo.boost / 45) * 100);
      totalScore += creatorScore * weights.creatorTrackRecord;
      totalWeight += weights.creatorTrackRecord;
      confidence = 'high'; // Creator track record gives high confidence
    }

    // Star power
    if (starPowerScore > 0) {
      totalScore += starPowerScore * weights.starPower;
      totalWeight += weights.starPower;
      if (starPowerScore >= 70 && confidence !== 'high') {
        confidence = 'medium';
      }
    }

    // Google Trends (already 0-100)
    if (avgTrends !== null) {
      totalScore += avgTrends * weights.trends;
      totalWeight += weights.trends;
      if (confidence === 'low') confidence = 'medium';
    }

    // Wikipedia views (log normalized)
    if (avgWiki !== null && avgWiki > 0) {
      const logNormalized = Math.min(100, Math.log10(avgWiki) * 10);
      totalScore += logNormalized * weights.wikipedia;
      totalWeight += weights.wikipedia;
    }

    // Base rate (default 50 for unknown titles)
    totalScore += 50 * weights.baseRate;
    totalWeight += weights.baseRate;

    // Calculate final momentum score
    momentumScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
  }

  // === ENHANCED RANK PREDICTION ===
  // Higher thresholds now that we have better signals
  let predictedRank: number;
  if (momentumScore >= 85) {
    predictedRank = 1; // Very high confidence for #1
  } else if (momentumScore >= 75) {
    predictedRank = 2;
  } else if (momentumScore >= 65) {
    predictedRank = 3;
  } else if (momentumScore >= 55) {
    predictedRank = 4;
  } else if (momentumScore >= 45) {
    predictedRank = 6;
  } else if (momentumScore >= 35) {
    predictedRank = 8;
  } else {
    predictedRank = 10;
  }

  // Calculate uncertainty based on signal availability
  // More signals = lower uncertainty
  let uncertainty = 3.5; // Base high uncertainty
  if (currentFlixPatrol) uncertainty -= 1.5; // Currently charting = very low uncertainty
  if (creatorInfo.boost > 0) uncertainty -= 1.0; // Creator track record reduces uncertainty significantly
  if (starPowerScore >= 60) uncertainty -= 0.5;
  if (avgTrends !== null) uncertainty -= 0.3;
  if (avgWiki !== null) uncertainty -= 0.2;
  uncertainty = Math.max(0.5, uncertainty); // Minimum 0.5 rank uncertainty

  // Generate percentile forecasts
  const p50 = predictedRank;
  const p10 = Math.max(1, Math.round(predictedRank - uncertainty));
  const p90 = Math.min(10, Math.round(predictedRank + uncertainty));

  const weekEnd = new Date(targetWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Calculate star power boost contribution (for explanation)
  const starPowerBoost = starPowerScore > 50 ? Math.round((starPowerScore - 50) / 5) : 0;

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
      // New explanation fields
      creatorBoost: creatorInfo.boost,
      creatorName: creatorInfo.creator ?? undefined,
      creatorReason: creatorInfo.reason ?? undefined,
      starPowerBoost,
      starPowerScore,
      // FlixPatrol current ranking
      currentFlixPatrolRank: currentFlixPatrol?.rank,
      currentFlixPatrolDate: currentFlixPatrol?.date.toISOString().split('T')[0],
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
