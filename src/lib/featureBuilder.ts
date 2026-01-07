/**
 * Feature Builder
 *
 * Computes derived features from raw Netflix and signals data
 * for use in momentum scoring and forecasting.
 */



import prisma from '@/lib/prisma';

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
  momentumBreakdown: MomentumBreakdown | null;
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
 * Momentum component breakdown for transparency
 */
export interface MomentumBreakdown {
  // Raw values
  trendsRaw: number | null;
  wikipediaRaw: number | null;
  rankDeltaRaw: number | null;

  // Normalized values (0-100 scale)
  trendsNormalized: number | null;
  wikipediaNormalized: number | null;
  rankDeltaNormalized: number | null;

  // Weights used
  weights: MomentumWeights;

  // Weighted contributions to final score
  trendsContribution: number;
  wikipediaContribution: number;
  rankDeltaContribution: number;

  // Final score
  totalScore: number;
}

/**
 * Calculate momentum score with full component breakdown
 */
export function calculateMomentumWithBreakdown(
  trendsValue: number | null,
  wikipediaValue: number | null,
  rankDelta: number | null,
  weights: MomentumWeights
): { score: number; breakdown: MomentumBreakdown } {
  let score = 0;
  let totalWeight = 0;

  // Initialize breakdown
  const breakdown: MomentumBreakdown = {
    trendsRaw: trendsValue,
    wikipediaRaw: wikipediaValue,
    rankDeltaRaw: rankDelta,
    trendsNormalized: null,
    wikipediaNormalized: null,
    rankDeltaNormalized: null,
    weights,
    trendsContribution: 0,
    wikipediaContribution: 0,
    rankDeltaContribution: 0,
    totalScore: 0,
  };

  // Google Trends component (already 0-100 scale)
  if (trendsValue !== null) {
    breakdown.trendsNormalized = Math.round(trendsValue);
    breakdown.trendsContribution = trendsValue * weights.trendsWeight;
    score += breakdown.trendsContribution;
    totalWeight += weights.trendsWeight;
  }

  // Wikipedia component (normalize using log scale for views)
  if (wikipediaValue !== null && wikipediaValue > 0) {
    // Log normalize: 1000 views = ~30, 10000 = ~40, 100000 = ~50, 1M = ~60
    const logNormalized = Math.min(100, Math.log10(wikipediaValue) * 10);
    breakdown.wikipediaNormalized = Math.round(logNormalized);
    breakdown.wikipediaContribution = logNormalized * weights.wikipediaWeight;
    score += breakdown.wikipediaContribution;
    totalWeight += weights.wikipediaWeight;
  }

  // Rank delta component (climbing ranks is positive momentum)
  if (rankDelta !== null) {
    // Normalize: -10 (dropping fast) to +10 (climbing fast) -> 0-100
    const normalizedDelta = normalizeToScale(rankDelta, -10, 10);
    breakdown.rankDeltaNormalized = Math.round(normalizedDelta);
    breakdown.rankDeltaContribution = normalizedDelta * weights.rankDeltaWeight;
    score += breakdown.rankDeltaContribution;
    totalWeight += weights.rankDeltaWeight;
  }

  // Normalize by actual weight used
  const finalScore = totalWeight === 0 ? 0 : Math.round(score / totalWeight);
  breakdown.totalScore = finalScore;

  return { score: finalScore, breakdown };
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
  const { score } = calculateMomentumWithBreakdown(trendsValue, wikipediaValue, rankDelta, weights);
  return score;
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
 * If no data found in the date range, finds the most recent data available
 */
async function getAverageSignal(
  titleId: string,
  source: 'TRENDS' | 'WIKIPEDIA',
  geo: 'US' | 'GLOBAL',
  startDate: Date,
  endDate: Date
): Promise<number | null> {
  // First try the specified date range
  const result = await prisma.dailySignal.aggregate({
    where: {
      titleId,
      source,
      geo,
      date: { gte: startDate, lte: endDate },
    },
    _avg: { value: true },
  });

  if (result._avg.value !== null) {
    return result._avg.value;
  }

  // If no data in the expected range, find most recent signals for this title
  // This handles cases where signal data is from a different time period
  const recentSignals = await prisma.dailySignal.findMany({
    where: {
      titleId,
      source,
      geo,
    },
    orderBy: { date: 'desc' },
    take: 7, // Get up to 7 most recent signals
    select: { value: true },
  });

  if (recentSignals.length === 0) {
    return null;
  }

  // Calculate average of most recent signals
  const sum = recentSignals.reduce((acc, s) => acc + s.value, 0);
  return sum / recentSignals.length;
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

  // Calculate date ranges for Netflix data
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(weekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);

  // For signals, use recent data (last 7 days from today) rather than week-specific
  // This ensures we have current signal data even if Netflix week hasn't started yet
  const today = new Date();
  const signalEndDate = today;
  const signalStartDate = new Date(today);
  signalStartDate.setDate(signalStartDate.getDate() - 7);

  const prevSignalEndDate = new Date(signalStartDate);
  prevSignalEndDate.setDate(prevSignalEndDate.getDate() - 1);
  const prevSignalStartDate = new Date(prevSignalEndDate);
  prevSignalStartDate.setDate(prevSignalStartDate.getDate() - 7);

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

  // Get signal averages for recent period (last 7 days)
  const trendsUS = await getAverageSignal(titleId, 'TRENDS', 'US', signalStartDate, signalEndDate);
  const trendsGlobal = await getAverageSignal(titleId, 'TRENDS', 'GLOBAL', signalStartDate, signalEndDate);
  const wikipediaViews = await getAverageSignal(titleId, 'WIKIPEDIA', 'GLOBAL', signalStartDate, signalEndDate);

  // Get signal averages for previous period
  const prevTrendsGlobal = await getAverageSignal(titleId, 'TRENDS', 'GLOBAL', prevSignalStartDate, prevSignalEndDate);
  const prevWikipediaViews = await getAverageSignal(titleId, 'WIKIPEDIA', 'GLOBAL', prevSignalStartDate, prevSignalEndDate);

  // Calculate deltas
  const globalRankDelta = calculateRankDelta(currentGlobal?.rank ?? null, previousGlobal?.rank ?? null);
  const usRankDelta = calculateRankDelta(currentUS?.rank ?? null, previousUS?.rank ?? null);
  const viewsGrowthPct = calculateGrowthPct(currentGlobal?.views ? Number(currentGlobal.views) : null, previousGlobal?.views ? Number(previousGlobal.views) : null);
  const trendsDelta = calculateGrowthPct(trendsGlobal, prevTrendsGlobal);
  const wikipediaDelta = calculateGrowthPct(wikipediaViews, prevWikipediaViews);

  // Use global rank delta for momentum, or US if global not available
  const primaryRankDelta = globalRankDelta ?? usRankDelta;

  // Calculate momentum score with breakdown
  const { score: momentumScore, breakdown: momentumBreakdown } = calculateMomentumWithBreakdown(
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
    globalViews: currentGlobal?.views ? Number(currentGlobal.views) : null,
    globalHoursViewed: currentGlobal?.hoursViewed ? Number(currentGlobal.hoursViewed) : null,
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
    momentumBreakdown,
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
