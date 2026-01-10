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
// v1.3.0: Added Polymarket probability as primary signal for pre-release forecasts
// v1.4.0: Tiered Polymarket confidence - override for high confidence, blend for toss-ups
// v1.4.1: Removed Polymarket from stored forecasts - applied dynamically at display time
//         This allows different predictions for US vs Global markets from same stored forecast
// v1.5.0: Added FlixPatrol TREND analysis (14-day slope) to detect falling titles
//         Titles falling out of Top 10 now correctly predicted to rank outside Top 10
//         Fixed: Titles like "Unlocked" that fell from #10 to #22 no longer predicted #3
export const MODEL_VERSION = '1.5.0';

/**
 * Get Polymarket probability for a title
 * Returns the market's probability (0-1) if the title is in an active market
 *
 * @param region - 'us' or 'global' to filter to correct market. If not specified, returns first match.
 */
async function getPolymarketProbability(
  titleName: string,
  titleType: 'MOVIE' | 'SHOW',
  region?: 'us' | 'global'
): Promise<{
  probability: number;
  marketUrl: string;
  marketRank: number; // 1 for #1 market, 2 for #2 market
  region: 'us' | 'global';
} | null> {
  try {
    // Fetch from our cached Polymarket API
    // Use production URL for consistency (VERCEL_URL can point to preview deployments)
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';

    const response = await fetch(`${baseUrl}/api/polymarket-netflix`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.warn('[getPolymarketProbability] API returned error:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.success) return null;

    // Flatten all markets into a single array
    const markets = Array.isArray(data.data)
      ? data.data
      : Object.values(data.data).flat();

    // Filter to relevant category based on type AND region
    let relevantCategories: string[];
    if (region) {
      // Filter to specific region
      relevantCategories = titleType === 'MOVIE'
        ? [`films-${region}`]
        : [`shows-${region}`];
    } else {
      // Check both regions, prefer US
      relevantCategories = titleType === 'MOVIE'
        ? ['films-us', 'films-global']
        : ['shows-us', 'shows-global'];
    }

    // Search for the title in market outcomes
    // Use case-insensitive partial matching since Polymarket names may vary slightly
    const normalizedTitleName = titleName.toLowerCase().trim();

    for (const market of markets as Array<{ category: string; rank: number; outcomes: Array<{ name: string; probability: number }>; polymarketUrl: string }>) {
      if (!relevantCategories.includes(market.category)) continue;

      for (const outcome of market.outcomes || []) {
        if (outcome.name.toLowerCase() === 'other') continue;

        const normalizedOutcome = outcome.name.toLowerCase().trim();

        // Match if names are similar (handles variations like "The Movie" vs "Movie")
        if (
          normalizedOutcome === normalizedTitleName ||
          normalizedOutcome.includes(normalizedTitleName) ||
          normalizedTitleName.includes(normalizedOutcome)
        ) {
          const matchedRegion = market.category.includes('global') ? 'global' : 'us';
          console.log(`[getPolymarketProbability] MATCH: "${titleName}" in ${matchedRegion} market: ${(outcome.probability * 100).toFixed(1)}%`);
          return {
            probability: outcome.probability,
            marketUrl: market.polymarketUrl,
            marketRank: market.rank,
            region: matchedRegion,
          };
        }
      }
    }

    console.log(`[getPolymarketProbability] NO MATCH for "${titleName}" in ${region || 'any'} market`);
    return null;
  } catch (error) {
    console.error('[getPolymarketProbability] Error fetching market data:', error);
    return null;
  }
}

/**
 * Get the most recent FlixPatrol daily rank for a title
 * Returns rank if currently charting (any rank), null otherwise
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

  if (latest) {
    return {
      rank: latest.rank,
      date: latest.date,
      region: latest.region,
    };
  }

  return null;
}

/**
 * FlixPatrol trend data over multiple days
 */
interface FlixPatrolTrend {
  currentRank: number | null;
  avgRank: number | null;
  rankSlope: number; // Negative = improving (climbing charts), Positive = declining (falling)
  dataPoints: number;
  trendDescription: 'rising_fast' | 'rising' | 'stable' | 'falling' | 'falling_fast' | 'unknown';
  firstRank: number | null;
  lastRank: number | null;
  peakRank: number | null;  // Best rank in period
  rankChange: number | null; // lastRank - firstRank (positive = fell, negative = improved)
}

/**
 * Get FlixPatrol rank trend over N days
 * Calculates slope of rank trajectory using linear regression
 *
 * @param region - 'world' for global rankings, 'us' for US rankings
 */
async function getFlixPatrolTrend(titleId: string, days: number = 14, region: 'world' | 'us' = 'world'): Promise<FlixPatrolTrend> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // Get all FlixPatrol daily entries for this title in the period
  const entries = await prisma.flixPatrolDaily.findMany({
    where: {
      titleId,
      date: { gte: startDate },
      region, // Use the specified region (US or worldwide)
    },
    orderBy: { date: 'asc' },
    select: { rank: true, date: true },
  });

  // Default result for no data
  if (entries.length === 0) {
    return {
      currentRank: null,
      avgRank: null,
      rankSlope: 0,
      dataPoints: 0,
      trendDescription: 'unknown',
      firstRank: null,
      lastRank: null,
      peakRank: null,
      rankChange: null,
    };
  }

  const ranks = entries.map((e: { rank: number; date: Date }) => e.rank);
  const firstRank = ranks[0];
  const lastRank = ranks[ranks.length - 1];
  const peakRank = Math.min(...ranks);
  const avgRank = ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length;
  const rankChange = lastRank - firstRank;

  // Calculate slope using linear regression if we have enough data
  let rankSlope = 0;
  if (entries.length >= 2) {
    // Simple linear regression: slope = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)²
    const n = entries.length;
    const xMean = (n - 1) / 2;
    const yMean = avgRank;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = ranks[i];
      numerator += (x - xMean) * (y - yMean);
      denominator += (x - xMean) * (x - xMean);
    }

    rankSlope = denominator !== 0 ? numerator / denominator : 0;
  }

  // Determine trend description
  // Note: POSITIVE slope means ranks are INCREASING (getting worse/falling)
  // NEGATIVE slope means ranks are DECREASING (getting better/rising)
  let trendDescription: FlixPatrolTrend['trendDescription'];
  if (rankSlope < -0.5) {
    trendDescription = 'rising_fast';    // Climbing charts quickly
  } else if (rankSlope < -0.15) {
    trendDescription = 'rising';         // Climbing charts
  } else if (rankSlope > 0.5) {
    trendDescription = 'falling_fast';   // Falling down charts quickly
  } else if (rankSlope > 0.15) {
    trendDescription = 'falling';        // Falling down charts
  } else {
    trendDescription = 'stable';
  }

  return {
    currentRank: lastRank,
    avgRank: Math.round(avgRank * 10) / 10,
    rankSlope: Math.round(rankSlope * 100) / 100,
    dataPoints: entries.length,
    trendDescription,
    firstRank,
    lastRank,
    peakRank,
    rankChange,
  };
}

/**
 * Convert FlixPatrol trend to momentum modifier
 *
 * Returns a modifier to add to momentum score:
 * - Titles rising fast: +30 to +50
 * - Titles rising: +10 to +30
 * - Stable titles: -5 to +5
 * - Titles falling: -10 to -30
 * - Titles falling fast: -30 to -50
 *
 * Also penalizes titles that have fallen out of Top 10
 */
function flixPatrolTrendToMomentum(trend: FlixPatrolTrend): {
  modifier: number;
  confidence: number;
  reason: string;
} {
  if (trend.dataPoints === 0) {
    return { modifier: 0, confidence: 0, reason: 'No FlixPatrol data' };
  }

  let modifier = 0;
  let reason = '';

  // Base modifier from slope
  // slope of +1 means rank increased by 1 per day (falling)
  // slope of -1 means rank decreased by 1 per day (rising)
  const slopeModifier = -trend.rankSlope * 15; // Amplify slope impact

  switch (trend.trendDescription) {
    case 'rising_fast':
      modifier = Math.min(50, 30 + Math.abs(slopeModifier));
      reason = `Rising fast (slope: ${trend.rankSlope})`;
      break;
    case 'rising':
      modifier = Math.min(30, 10 + Math.abs(slopeModifier));
      reason = `Rising (slope: ${trend.rankSlope})`;
      break;
    case 'stable':
      modifier = slopeModifier; // Small adjustment
      reason = `Stable (slope: ${trend.rankSlope})`;
      break;
    case 'falling':
      modifier = Math.max(-30, -10 + slopeModifier);
      reason = `Falling (slope: ${trend.rankSlope})`;
      break;
    case 'falling_fast':
      modifier = Math.max(-50, -30 + slopeModifier);
      reason = `Falling fast (slope: ${trend.rankSlope})`;
      break;
    default:
      modifier = 0;
      reason = 'Unknown trend';
  }

  // Additional penalty for titles outside Top 10
  // This is crucial for titles like "Unlocked" that fell from #10 to #22
  if (trend.currentRank !== null && trend.currentRank > 10) {
    const outsideTop10Penalty = -Math.min(30, (trend.currentRank - 10) * 3);
    modifier += outsideTop10Penalty;
    reason += `, currently #${trend.currentRank} (outside Top 10)`;
  }

  // Bonus for titles in Top 3
  if (trend.currentRank !== null && trend.currentRank <= 3) {
    modifier += 10;
    reason += `, currently #${trend.currentRank}`;
  }

  // Confidence based on data points
  const confidence = Math.min(1, trend.dataPoints / 7); // Full confidence at 7+ days

  return {
    modifier: Math.round(modifier),
    confidence,
    reason,
  };
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
  // Creator/star power fields for enhanced pre-release forecasting
  creatorBoost?: number;
  creatorName?: string;
  creatorReason?: string;
  starPowerBoost?: number;
  starPowerScore?: number;
  // FlixPatrol current ranking and trend
  currentFlixPatrolRank?: number;
  currentFlixPatrolDate?: string;
  flixPatrolTrend?: {
    slope: number;
    description: string;
    rankChange: number | null;
    firstRank: number | null;
    dataPoints: number;
  };
  flixPatrolTrendModifier?: number;
  // Polymarket probability (v1.3)
  polymarketProbability?: number;
  polymarketUrl?: string;
  polymarketMarketRank?: number;
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
 * v1.4.0: Now also checks Polymarket for titles with Netflix history
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

  // === v1.4.1: Don't bake Polymarket into stored forecast ===
  // Polymarket adjustment is applied dynamically at display time based on
  // which region (US/Global) the user is viewing.
  const finalForecast = Math.max(1, Math.min(10, adjustedForecast));

  // Calculate uncertainty from historical residuals
  const residualStd = calculateResiduals(historical);

  // Calculate confidence based on data availability
  const hasSignals = features?.trendsGlobal !== null || features?.wikipediaViews !== null;
  const hasEnoughHistory = historical.length >= 4;
  const confidence: 'low' | 'medium' | 'high' =
    hasEnoughHistory && hasSignals ? 'high' : hasEnoughHistory || hasSignals ? 'medium' : 'low';

  // Generate percentile forecasts
  // For ranks, lower is better so p10 (optimistic) is lower
  const p50 = Math.round(Math.max(1, Math.min(10, finalForecast)));
  const p10 = Math.round(Math.max(1, Math.min(10, finalForecast - residualStd * 1.28)));
  const p90 = Math.round(Math.max(1, Math.min(10, finalForecast + residualStd * 1.28)));

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
      // Note: Polymarket data is applied dynamically at display time, not stored here
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
 * ENHANCED MODEL (v1.3):
 * Uses Polymarket probability as primary signal when available.
 * Other factors are used as secondary/fallback signals:
 *
 * WITH Polymarket data:
 * - Polymarket probability (35%): Market consensus is the strongest predictor
 * - Creator track record (25%): Historical hit rate
 * - Star power (20%): A-list cast draw
 * - Google Trends (12%): Pre-release search interest
 * - Wikipedia views (8%): Article traffic
 *
 * WITHOUT Polymarket data:
 * - Creator track record (30%)
 * - Star power (25%)
 * - Google Trends (20%)
 * - Wikipedia views (15%)
 * - Base rate (10%)
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

  // === Get creator track record boost ===
  const creatorInfo = getCreatorMomentumBoost(title.canonicalName);

  // === Get current FlixPatrol daily rank ===
  // If a title is ALREADY charting, this is the strongest signal
  const currentFlixPatrol = await getLatestFlixPatrolRank(titleId);

  // === Get FlixPatrol TREND over 14 days ===
  // This is CRITICAL for titles that are falling down the charts
  const flixPatrolTrend = await getFlixPatrolTrend(titleId, 14);
  const trendMomentum = flixPatrolTrendToMomentum(flixPatrolTrend);

  if (flixPatrolTrend.dataPoints > 0) {
    console.log(`[generatePreReleaseForecast] ${title.canonicalName} FlixPatrol trend: ${flixPatrolTrend.trendDescription} (slope: ${flixPatrolTrend.rankSlope}, change: ${flixPatrolTrend.firstRank} → ${flixPatrolTrend.lastRank})`);
  }

  // === Get star power from MarketThesis ===
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

  // === v1.4.1: Don't bake Polymarket into stored forecast ===
  // Polymarket adjustment is now applied dynamically at display time based on
  // which region (US/Global) the user is viewing. This allows the same stored
  // forecast to show different predictions for different regional markets.
  //
  // The stored forecast uses only: FlixPatrol, creator track record, star power,
  // Google Trends, and Wikipedia signals.

  // === MOMENTUM CALCULATION ===
  // Priority: FlixPatrol TREND (actual data with trajectory) > Current rank > Other signals

  let momentumScore: number;
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (flixPatrolTrend.dataPoints > 0) {
    // We have FlixPatrol data - use trend-aware calculation
    const currentRank = flixPatrolTrend.currentRank ?? 50; // Default to 50 if somehow null

    // Base momentum from current rank
    // #1 = 100, #5 = 80, #10 = 55, #15 = 30, #20 = 5, #25+ = 0
    if (currentRank <= 10) {
      momentumScore = 100 - (currentRank - 1) * 5;
    } else {
      // Titles outside Top 10 get significantly lower base scores
      // #11 = 45, #15 = 25, #20 = 0
      momentumScore = Math.max(0, 50 - (currentRank - 10) * 5);
    }

    // Apply trend modifier - this is CRITICAL
    // A title falling from #10 to #22 will have a large negative modifier
    momentumScore += trendMomentum.modifier;

    // Clamp to valid range
    momentumScore = Math.max(0, Math.min(100, momentumScore));

    // Confidence is high when we have actual charting data
    confidence = flixPatrolTrend.dataPoints >= 5 ? 'high' : 'medium';

    console.log(`[generatePreReleaseForecast] ${title.canonicalName}: rank=${currentRank}, baseMomentum=${100 - (currentRank <= 10 ? (currentRank - 1) * 5 : 50 + (currentRank - 10) * 5)}, trendModifier=${trendMomentum.modifier} (${trendMomentum.reason}), finalMomentum=${momentumScore}`);
  } else if (currentFlixPatrol) {
    // Fallback to just current rank if no trend data
    momentumScore = 100 - (currentFlixPatrol.rank - 1) * 5;
    momentumScore = Math.max(0, momentumScore);
    confidence = 'medium';
    console.log(`[generatePreReleaseForecast] ${title.canonicalName} is currently #${currentFlixPatrol.rank} on FlixPatrol (no trend data)`);
  } else {
    // No Polymarket data - use traditional weighted model
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
  // v1.5: Now handles titles falling outside Top 10
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
  } else if (momentumScore >= 25) {
    predictedRank = 10;
  } else if (momentumScore >= 15) {
    // Falling titles - predicted outside Top 10
    predictedRank = 12;
  } else if (momentumScore >= 5) {
    predictedRank = 15;
  } else {
    // Very low momentum - likely to fall significantly
    predictedRank = 20;
  }

  // Calculate uncertainty based on signal availability
  // v1.5: Now considers FlixPatrol trend confidence
  let uncertainty = 3.5; // Base high uncertainty for pre-release

  if (flixPatrolTrend.dataPoints > 0) {
    // We have FlixPatrol data - uncertainty based on trend confidence
    uncertainty = 2.0 - trendMomentum.confidence; // 1.0-2.0 range based on data points
    // Falling titles have higher uncertainty about floor
    if (flixPatrolTrend.trendDescription.startsWith('falling')) {
      uncertainty += 1.0;
    }
  } else if (currentFlixPatrol) {
    uncertainty = 1.5; // Currently charting but no trend = medium uncertainty
  } else {
    // Reduce uncertainty based on available signals
    if (creatorInfo.boost > 0) uncertainty -= 0.8;
    if (starPowerScore >= 60) uncertainty -= 0.4;
    if (avgTrends !== null) uncertainty -= 0.2;
    if (avgWiki !== null) uncertainty -= 0.1;
  }

  uncertainty = Math.max(0.5, uncertainty); // Minimum 0.5 rank uncertainty

  // Generate percentile forecasts
  // Note: p90 can now exceed 10 for falling titles
  const p50 = predictedRank;
  const p10 = Math.max(1, Math.round(predictedRank - uncertainty));
  const p90 = Math.round(predictedRank + uncertainty); // No upper cap for falling titles

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
      rankTrendContribution: trendMomentum.modifier || null,
      historicalPattern: flixPatrolTrend.dataPoints > 0 ? flixPatrolTrend.trendDescription : 'pre_release',
      confidence,
      momentumBreakdown: null,
      // Creator/star power fields
      creatorBoost: creatorInfo.boost,
      creatorName: creatorInfo.creator ?? undefined,
      creatorReason: creatorInfo.reason ?? undefined,
      starPowerBoost,
      starPowerScore,
      // FlixPatrol current ranking and trend
      currentFlixPatrolRank: flixPatrolTrend.currentRank ?? currentFlixPatrol?.rank,
      currentFlixPatrolDate: currentFlixPatrol?.date.toISOString().split('T')[0],
      flixPatrolTrend: flixPatrolTrend.dataPoints > 0 ? {
        slope: flixPatrolTrend.rankSlope,
        description: flixPatrolTrend.trendDescription,
        rankChange: flixPatrolTrend.rankChange,
        firstRank: flixPatrolTrend.firstRank,
        dataPoints: flixPatrolTrend.dataPoints,
      } : undefined,
      flixPatrolTrendModifier: trendMomentum.modifier || undefined,
      // Note: Polymarket data is applied dynamically at display time, not stored here
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
          modelVersion: MODEL_VERSION,
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

// ============================================================================
// MARKET PROBABILITY DISTRIBUTION (v1.6)
// Generates probabilities for all titles in a Polymarket market that sum to 100%
// ============================================================================

export type MarketCategory = 'shows-us' | 'shows-global' | 'films-us' | 'films-global';

export interface TitleProbability {
  name: string;
  titleId: string | null;
  probability: number;  // 0-100, all probabilities sum to 100
  rawScore: number;     // The underlying momentum/strength score
  flixPatrolRank: number | null;
  flixPatrolTrend: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface MarketProbabilities {
  category: MarketCategory;
  marketQuestion: string;
  outcomes: TitleProbability[];
  otherProbability: number;  // Probability that winner is not in the outcome list
  totalProbability: number;  // Should always be 100
  modelVersion: string;
  generatedAt: Date;
}

interface PolymarketOutcome {
  name: string;
  probability?: number;
  volume?: number;
}

/**
 * Normalize a title name for matching (same as in chart API)
 */
function normalizeForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/:\s*season\s*\d+/i, '')
    .replace(/\s*season\s*\d+/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Softmax function to convert raw scores to probabilities
 * Temperature controls sharpness: lower = more confident, higher = more uniform
 */
function softmax(scores: number[], temperature: number = 15): number[] {
  // Shift scores to prevent overflow (subtract max)
  const maxScore = Math.max(...scores);
  const shifted = scores.map(s => (s - maxScore) / temperature);
  const exps = shifted.map(s => Math.exp(s));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => (e / sum) * 100);
}

/**
 * Calculate raw strength score for a title based on FlixPatrol data and signals
 * Returns 0-100 score where higher = more likely to be #1
 */
async function calculateTitleStrength(
  titleName: string,
  titleId: string | null,
  category: 'tv' | 'movies',
  region: 'world' | 'us' = 'world'
): Promise<{
  score: number;
  flixPatrolRank: number | null;
  flixPatrolTrend: string | null;
  confidence: 'low' | 'medium' | 'high';
}> {
  let score = 50; // Base neutral score
  let flixPatrolRank: number | null = null;
  let flixPatrolTrend: string | null = null;
  let confidence: 'low' | 'medium' | 'high' = 'low';

  // If we have a titleId, get FlixPatrol data
  if (titleId) {
    const trend = await getFlixPatrolTrend(titleId, 14, region);

    if (trend.dataPoints > 0) {
      flixPatrolRank = trend.currentRank;
      flixPatrolTrend = trend.trendDescription;

      // Score based on current rank
      // #1 = 100, #2 = 90, #3 = 80, ..., #10 = 10, outside top 10 = decreasing
      if (trend.currentRank !== null) {
        if (trend.currentRank <= 10) {
          score = 100 - (trend.currentRank - 1) * 10;
        } else {
          // Steep dropoff for titles outside top 10
          score = Math.max(0, 10 - (trend.currentRank - 10) * 2);
        }
      }

      // Apply trend modifier
      const trendMod = flixPatrolTrendToMomentum(trend);
      score += trendMod.modifier * 0.5; // Dampen trend effect
      score = Math.max(0, Math.min(100, score));

      confidence = trend.dataPoints >= 5 ? 'high' : 'medium';
    }
  }

  // If no FlixPatrol data, try to match by name
  if (flixPatrolRank === null) {
    const normalizedName = normalizeForMatching(titleName);

    // Search FlixPatrol by title name (use the specified region)
    const recentEntries = await prisma.flixPatrolDaily.findMany({
      where: {
        category,
        region,
        date: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const match = recentEntries.find((e: { titleName: string; rank: number }) =>
      normalizeForMatching(e.titleName) === normalizedName
    );

    if (match) {
      flixPatrolRank = match.rank;
      if (match.rank <= 10) {
        score = 100 - (match.rank - 1) * 10;
      } else {
        score = Math.max(0, 10 - (match.rank - 10) * 2);
      }
      confidence = 'medium';
    }
  }

  return { score, flixPatrolRank, flixPatrolTrend, confidence };
}

/**
 * Generate probability distribution for a Polymarket market
 *
 * Returns probabilities for each outcome title that sum to 100%.
 * Uses FlixPatrol rankings and trends as primary signals.
 */
export async function generateMarketProbabilities(
  marketCategory: MarketCategory
): Promise<MarketProbabilities> {
  // Determine market type and region
  const isShows = marketCategory.startsWith('shows');
  const isUS = marketCategory.endsWith('-us');
  const category: 'tv' | 'movies' = isShows ? 'tv' : 'movies';
  const flixPatrolRegion: 'world' | 'us' = isUS ? 'us' : 'world';
  const searchTerm = isShows ? 'Netflix show' : 'Netflix movie';
  const regionTerm = isUS ? 'US' : 'Global';

  // Get active Polymarket markets for this category
  const markets = await prisma.polymarketMarket.findMany({
    where: {
      question: {
        contains: searchTerm,
        mode: 'insensitive',
      },
      isActive: true,
    },
    select: { question: true, outcomes: true },
  });

  // Find the relevant market (filter by region in question)
  const market = markets.find((m: { question: string; outcomes: unknown }) =>
    m.question.toLowerCase().includes(isUS ? 'us' : 'global') ||
    m.question.toLowerCase().includes(isUS ? 'united states' : 'worldwide')
  ) || markets[0];

  if (!market || !Array.isArray(market.outcomes)) {
    return {
      category: marketCategory,
      marketQuestion: `What will be the top ${regionTerm} ${isShows ? 'Netflix show' : 'Netflix movie'} this week?`,
      outcomes: [],
      otherProbability: 100,
      totalProbability: 100,
      modelVersion: MODEL_VERSION,
      generatedAt: new Date(),
    };
  }

  const outcomes = market.outcomes as PolymarketOutcome[];

  // Filter out "Other" outcome - we'll calculate it ourselves
  const titleOutcomes = outcomes.filter(o =>
    o.name && o.name.toLowerCase() !== 'other'
  );

  // Get Title records for matching
  const titleType = isShows ? 'SHOW' : 'MOVIE';
  const allTitles = await prisma.title.findMany({
    where: { type: titleType },
    select: { id: true, canonicalName: true },
  });

  // Calculate strength scores for each outcome
  const outcomeScores: Array<{
    name: string;
    titleId: string | null;
    score: number;
    flixPatrolRank: number | null;
    flixPatrolTrend: string | null;
    confidence: 'low' | 'medium' | 'high';
  }> = [];

  for (const outcome of titleOutcomes) {
    // Try to find matching title in database
    const normalizedOutcome = normalizeForMatching(outcome.name);
    const matchingTitle = allTitles.find((t: { id: string; canonicalName: string }) =>
      normalizeForMatching(t.canonicalName) === normalizedOutcome
    );

    const strength = await calculateTitleStrength(
      outcome.name,
      matchingTitle?.id || null,
      category,
      flixPatrolRegion
    );

    outcomeScores.push({
      name: outcome.name,
      titleId: matchingTitle?.id || null,
      ...strength,
    });
  }

  // Add small score for "Other" to ensure it has some probability
  const otherBaseScore = 15; // Base 15% expectation for unlisted titles

  // Get all scores including "Other"
  const allScores = [...outcomeScores.map(o => o.score), otherBaseScore];

  // Apply softmax to get probabilities
  // Use temperature 12 for relatively sharp but not extreme distribution
  const probabilities = softmax(allScores, 12);

  // Build outcome list
  const titleProbabilities: TitleProbability[] = outcomeScores.map((o, i) => ({
    name: o.name,
    titleId: o.titleId,
    probability: Math.round(probabilities[i] * 10) / 10, // Round to 1 decimal
    rawScore: o.score,
    flixPatrolRank: o.flixPatrolRank,
    flixPatrolTrend: o.flixPatrolTrend,
    confidence: o.confidence,
  }));

  // Sort by probability descending
  titleProbabilities.sort((a, b) => b.probability - a.probability);

  const otherProbability = Math.round(probabilities[probabilities.length - 1] * 10) / 10;

  // Ensure total is exactly 100 (fix rounding errors)
  const rawTotal = titleProbabilities.reduce((sum, t) => sum + t.probability, 0) + otherProbability;
  const adjustment = 100 - rawTotal;
  if (titleProbabilities.length > 0) {
    titleProbabilities[0].probability += adjustment; // Add rounding error to top title
  }

  return {
    category: marketCategory,
    marketQuestion: market.question,
    outcomes: titleProbabilities,
    otherProbability,
    totalProbability: 100,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date(),
  };
}
