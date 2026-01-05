/**
 * Feature Builder
 *
 * Computes derived features from raw Netflix and signals data
 * for use in momentum scoring and forecasting.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface TitleFeatures {
  titleId: string;
  canonicalName: string;
  type: 'SHOW' | 'MOVIE';
  weekStart: Date;

  // Netflix features
  globalRank: number | null;
  usRank: number | null;
  globalViews: number | null;
  globalHoursViewed: number | null;

  // Rank deltas (positive = climbing, negative = falling)
  globalRankDelta: number | null;
  usRankDelta: number | null;

  // Week-over-week growth
  viewsGrowthPct: number | null;

  // Signal features (7-day averages)
  trendsUS: number | null;
  trendsGlobal: number | null;
  wikipediaViews: number | null;

  // Signal deltas (7d avg vs prior 7d avg)
  trendsDelta: number | null;
  wikipediaDelta: number | null;

  // Computed scores
  momentumScore: number;
  accelerationScore: number;
}

export interface MomentumWeights {
  trendsWeight: number;
  wikipediaWeight: number;
  rankDeltaWeight: number;
}

const DEFAULT_WEIGHTS: MomentumWeights = {
  trendsWeight: 0.33,
  wikipediaWeight: 0.33,
  rankDeltaWeight: 0.34,
};

/**
 * Get the momentum weights from app config or use defaults
 */
export async function getMomentumWeights(): Promise<MomentumWeights> {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { key: 'momentumWeights' },
    });

    if (config?.value) {
      const value = config.value as unknown as MomentumWeights;
      return {
        trendsWeight: value.trendsWeight ?? DEFAULT_WEIGHTS.trendsWeight,
        wikipediaWeight: value.wikipediaWeight ?? DEFAULT_WEIGHTS.wikipediaWeight,
        rankDeltaWeight: value.rankDeltaWeight ?? DEFAULT_WEIGHTS.rankDeltaWeight,
      };
    }
  } catch {
    // Fall back to defaults
  }

  return DEFAULT_WEIGHTS;
}

/**
 * Get the breakout threshold from app config or use default
 */
export async function getBreakoutThreshold(): Promise<number> {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { key: 'breakoutThreshold' },
    });

    if (config?.value && typeof config.value === 'object' && 'value' in config.value) {
      return (config.value as { value: number }).value;
    }
  } catch {
    // Fall back to default
  }

  return 60; // Default threshold
}

/**
 * Calculate rank delta (positive means climbing in rank)
 */
function calculateRankDelta(currentRank: number | null, previousRank: number | null): number | null {
  if (currentRank === null || previousRank === null) return null;
  // Climbing from rank 5 to rank 2 = +3 (positive is good)
  return previousRank - currentRank;
}

/**
 * Calculate percentage growth
 */
function calculateGrowthPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Normalize a value to 0-100 scale using min-max normalization
 */
function normalizeToScale(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

/**
 * Calculate momentum score from component signals
 */
export function calculateMomentumScore(
  trendsValue: number | null,
  wikipediaValue: number | null,
  rankDelta: number | null,
  weights: MomentumWeights
): number {
  let score = 0;
  let totalWeight = 0;

  // Google Trends component (already 0-100 scale)
  if (trendsValue !== null) {
    score += trendsValue * weights.trendsWeight;
    totalWeight += weights.trendsWeight;
  }

  // Wikipedia component (normalize using log scale for views)
  if (wikipediaValue !== null && wikipediaValue > 0) {
    // Log normalize: 1000 views = ~30, 10000 = ~40, 100000 = ~50, 1M = ~60
    const logNormalized = Math.min(100, Math.log10(wikipediaValue) * 10);
    score += logNormalized * weights.wikipediaWeight;
    totalWeight += weights.wikipediaWeight;
  }

  // Rank delta component (climbing ranks is positive momentum)
  if (rankDelta !== null) {
    // Normalize: -10 (dropping fast) to +10 (climbing fast) -> 0-100
    const normalizedDelta = normalizeToScale(rankDelta, -10, 10);
    score += normalizedDelta * weights.rankDeltaWeight;
    totalWeight += weights.rankDeltaWeight;
  }

  // If no components available, return 0
  if (totalWeight === 0) return 0;

  // Normalize by actual weight used
  return Math.round(score / totalWeight);
}

/**
 * Calculate acceleration score (change in momentum)
 */
export function calculateAccelerationScore(
  currentMomentum: number,
  previousMomentum: number | null
): number {
  if (previousMomentum === null) return 0;

  // Acceleration is the delta in momentum, scaled to -100 to +100
  const delta = currentMomentum - previousMomentum;

  // Clamp to reasonable range
  return Math.max(-100, Math.min(100, delta * 2));
}

/**
 * Get average signal value for a date range
 */
async function getAverageSignal(
  titleId: string,
  source: 'TRENDS' | 'WIKIPEDIA',
  geo: 'US' | 'GLOBAL',
  startDate: Date,
  endDate: Date
): Promise<number | null> {
  const result = await prisma.dailySignal.aggregate({
    where: {
      titleId,
      source,
      geo,
      date: { gte: startDate, lte: endDate },
    },
    _avg: { value: true },
  });

  return result._avg.value;
}

/**
 * Build features for a single title and week
 */
export async function buildTitleFeatures(
  titleId: string,
  weekStart: Date,
  weights: MomentumWeights
): Promise<TitleFeatures | null> {
  // Get title info
  const title = await prisma.title.findUnique({
    where: { id: titleId },
    select: { canonicalName: true, type: true },
  });

  if (!title) return null;

  // Calculate date ranges
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(weekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);

  // Get current week Netflix data
  const currentGlobal = await prisma.netflixWeeklyGlobal.findFirst({
    where: { titleId, weekStart },
    orderBy: { rank: 'asc' },
  });

  const currentUS = await prisma.netflixWeeklyUS.findFirst({
    where: { titleId, weekStart },
    orderBy: { rank: 'asc' },
  });

  // Get previous week Netflix data
  const previousGlobal = await prisma.netflixWeeklyGlobal.findFirst({
    where: { titleId, weekStart: previousWeekStart },
    orderBy: { rank: 'asc' },
  });

  const previousUS = await prisma.netflixWeeklyUS.findFirst({
    where: { titleId, weekStart: previousWeekStart },
    orderBy: { rank: 'asc' },
  });

  // Get signal averages for current week
  const trendsUS = await getAverageSignal(titleId, 'TRENDS', 'US', weekStart, weekEnd);
  const trendsGlobal = await getAverageSignal(titleId, 'TRENDS', 'GLOBAL', weekStart, weekEnd);
  const wikipediaViews = await getAverageSignal(titleId, 'WIKIPEDIA', 'GLOBAL', weekStart, weekEnd);

  // Get signal averages for previous week
  const prevTrendsGlobal = await getAverageSignal(titleId, 'TRENDS', 'GLOBAL', previousWeekStart, previousWeekEnd);
  const prevWikipediaViews = await getAverageSignal(titleId, 'WIKIPEDIA', 'GLOBAL', previousWeekStart, previousWeekEnd);

  // Calculate deltas
  const globalRankDelta = calculateRankDelta(currentGlobal?.rank ?? null, previousGlobal?.rank ?? null);
  const usRankDelta = calculateRankDelta(currentUS?.rank ?? null, previousUS?.rank ?? null);
  const viewsGrowthPct = calculateGrowthPct(currentGlobal?.views ?? null, previousGlobal?.views ?? null);
  const trendsDelta = calculateGrowthPct(trendsGlobal, prevTrendsGlobal);
  const wikipediaDelta = calculateGrowthPct(wikipediaViews, prevWikipediaViews);

  // Use global rank delta for momentum, or US if global not available
  const primaryRankDelta = globalRankDelta ?? usRankDelta;

  // Calculate momentum score
  const momentumScore = calculateMomentumScore(
    trendsGlobal ?? trendsUS,
    wikipediaViews,
    primaryRankDelta,
    weights
  );

  // Get previous momentum for acceleration calculation
  const previousFeatures = await getPreviousMomentum(titleId, weekStart);
  const accelerationScore = calculateAccelerationScore(momentumScore, previousFeatures);

  return {
    titleId,
    canonicalName: title.canonicalName,
    type: title.type,
    weekStart,
    globalRank: currentGlobal?.rank ?? null,
    usRank: currentUS?.rank ?? null,
    globalViews: currentGlobal?.views ?? null,
    globalHoursViewed: currentGlobal?.hoursViewed ?? null,
    globalRankDelta,
    usRankDelta,
    viewsGrowthPct,
    trendsUS,
    trendsGlobal,
    wikipediaViews,
    trendsDelta,
    wikipediaDelta,
    momentumScore,
    accelerationScore,
  };
}

/**
 * Get previous week's momentum score for acceleration calculation
 */
async function getPreviousMomentum(titleId: string, currentWeekStart: Date): Promise<number | null> {
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const previousForecast = await prisma.forecastWeekly.findFirst({
    where: {
      titleId,
      weekStart: previousWeekStart,
    },
    select: { explainJson: true },
  });

  if (previousForecast?.explainJson) {
    const explain = previousForecast.explainJson as { momentumScore?: number };
    return explain.momentumScore ?? null;
  }

  return null;
}

/**
 * Build features for all active titles for a specific week
 */
export async function buildAllFeatures(weekStart: Date): Promise<TitleFeatures[]> {
  const weights = await getMomentumWeights();

  // Get all titles with data for this week
  const titlesWithData = await prisma.netflixWeeklyGlobal.findMany({
    where: { weekStart },
    select: { titleId: true },
    distinct: ['titleId'],
  });

  const usData = await prisma.netflixWeeklyUS.findMany({
    where: { weekStart },
    select: { titleId: true },
    distinct: ['titleId'],
  });

  // Combine and dedupe
  const titleIds = new Set([
    ...titlesWithData.map((t) => t.titleId),
    ...usData.map((t) => t.titleId),
  ]);

  const features: TitleFeatures[] = [];

  for (const titleId of titleIds) {
    const feature = await buildTitleFeatures(titleId, weekStart, weights);
    if (feature) {
      features.push(feature);
    }
  }

  return features;
}

/**
 * Get top movers (highest momentum scores)
 */
export async function getTopMovers(
  weekStart: Date,
  limit: number = 10
): Promise<TitleFeatures[]> {
  const allFeatures = await buildAllFeatures(weekStart);

  return allFeatures
    .filter((f) => f.momentumScore > 0)
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, limit);
}

/**
 * Get breakout titles (momentum above threshold with positive acceleration)
 */
export async function getBreakouts(weekStart: Date): Promise<TitleFeatures[]> {
  const threshold = await getBreakoutThreshold();
  const allFeatures = await buildAllFeatures(weekStart);

  return allFeatures
    .filter((f) => f.momentumScore >= threshold && f.accelerationScore > 0)
    .sort((a, b) => b.accelerationScore - a.accelerationScore);
}
