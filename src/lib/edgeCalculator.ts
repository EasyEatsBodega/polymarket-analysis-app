/**
 * Edge Calculator Library
 *
 * Calculates model-implied probabilities for Netflix titles winning #1 rank
 * and compares against Polymarket odds to identify mispriced markets.
 */

export interface ModelProbability {
  titleId: string | null;
  titleName: string;
  impliedProbability: number;  // 0-1 scale
  confidence: 'low' | 'medium' | 'high';
  components: {
    momentumComponent: number;
    rankForecastComponent: number;
    accelerationBonus: number;
  };
}

export interface EdgeOpportunity {
  marketSlug: string;
  marketLabel: string;
  polymarketUrl: string;
  category: string;
  outcomeName: string;
  titleId: string | null;
  titleName: string | null;

  // Probabilities
  marketProbability: number;   // From Polymarket (0-1)
  modelProbability: number;    // Our calculation (0-1)

  // Edge calculation
  edge: number;                // model - market (positive = underpriced)
  edgePercent: number;         // Edge as percentage points

  // Signal strength
  signalStrength: 'strong' | 'moderate' | 'weak';
  direction: 'BUY' | 'AVOID';

  // Supporting data
  momentumScore: number;
  accelerationScore: number;
  forecastP50: number | null;
  forecastP10: number | null;
  forecastP90: number | null;
  confidence: 'low' | 'medium' | 'high';
  historicalPattern: string;

  // Reasoning - why we think this is mispriced
  reasoning: string;

  // Price history for trend
  priceChange24h: number | null;
}

/**
 * Maps momentum score (0-100) to win probability (0-1)
 *
 * Uses sigmoid-like curve centered at 65 (not 50) because Netflix Top 10
 * competition is fierce - average momentum is not enough to win #1.
 *
 * Mapping:
 * - 80+ momentum: 60-85% probability (strong signal)
 * - 60-80 momentum: 30-60% probability (moderate)
 * - 40-60 momentum: 10-30% probability (neutral)
 * - <40 momentum: 0-10% probability (weak)
 */
export function momentumToProbability(momentumScore: number): number {
  // Clamp to valid range
  const clamped = Math.max(0, Math.min(100, momentumScore));

  // Sigmoid transformation centered at 65, scaled for Netflix competition
  const normalized = (clamped - 65) / 35;  // -1.86 to 1
  const sigmoid = 1 / (1 + Math.exp(-3.5 * normalized));

  // Scale to max ~85% (no single title is guaranteed to win)
  return Math.min(0.85, sigmoid * 0.85);
}

/**
 * Adjusts probability based on rank forecast confidence
 *
 * If p50 = #1: Strong boost (+15-20%)
 * If p10 = #1 (optimistic): Moderate boost (+5%)
 * If p90 <= #2 (even pessimistic is top-2): Strong boost (+10%)
 */
export function applyRankForecastAdjustment(
  baseProbability: number,
  p10: number,
  p50: number,
  p90: number
): number {
  let adjustment = 0;

  // Median forecast is #1
  if (p50 === 1) {
    adjustment += 0.18;
  } else if (p50 === 2) {
    adjustment += 0.08;
  } else if (p50 === 3) {
    adjustment += 0.03;
  }

  // Optimistic case shows #1 potential
  if (p10 === 1 && p50 !== 1) {
    adjustment += 0.05;
  }

  // High floor - even worst case is top 2
  if (p90 <= 2) {
    adjustment += 0.08;
  } else if (p90 <= 3) {
    adjustment += 0.03;
  }

  return Math.min(0.90, baseProbability + adjustment);
}

/**
 * Calculate model-implied probability for a title
 */
export function calculateModelProbability(
  momentumScore: number,
  accelerationScore: number,
  forecast: { p10: number; p50: number; p90: number } | null,
  confidence: 'low' | 'medium' | 'high'
): ModelProbability & { probability: number } {
  // Base probability from momentum
  let probability = momentumToProbability(momentumScore);
  const momentumComponent = probability;

  // Apply rank forecast adjustment if available
  let rankForecastComponent = 0;
  if (forecast) {
    const beforeForecast = probability;
    probability = applyRankForecastAdjustment(
      probability,
      forecast.p10,
      forecast.p50,
      forecast.p90
    );
    rankForecastComponent = probability - beforeForecast;
  }

  // Acceleration bonus: positive acceleration suggests momentum is increasing
  let accelerationBonus = 0;
  if (accelerationScore > 0) {
    accelerationBonus = Math.min(0.05, accelerationScore / 200);
  } else {
    accelerationBonus = Math.max(-0.05, accelerationScore / 200);
  }
  probability += accelerationBonus;

  // Confidence penalty for low-confidence predictions
  if (confidence === 'low') {
    probability *= 0.7;  // Reduce by 30%
  } else if (confidence === 'medium') {
    probability *= 0.85;  // Reduce by 15%
  }

  // Clamp final probability
  probability = Math.max(0.01, Math.min(0.90, probability));

  return {
    titleId: null,
    titleName: '',
    impliedProbability: probability,
    probability,
    confidence,
    components: {
      momentumComponent,
      rankForecastComponent,
      accelerationBonus,
    },
  };
}

/**
 * Calculate edge between model and market
 */
export function calculateEdge(
  marketProbability: number,
  modelProbability: number
): { edge: number; edgePercent: number; signalStrength: 'strong' | 'moderate' | 'weak'; direction: 'BUY' | 'AVOID' } {
  const edge = modelProbability - marketProbability;
  const edgePercent = edge * 100;

  let signalStrength: 'strong' | 'moderate' | 'weak';

  if (Math.abs(edgePercent) >= 20) {
    signalStrength = 'strong';
  } else if (Math.abs(edgePercent) >= 10) {
    signalStrength = 'moderate';
  } else {
    signalStrength = 'weak';
  }

  // Positive edge = model thinks it's more likely than market = underpriced = BUY
  const direction = edge > 0 ? 'BUY' : 'AVOID';

  return { edge, edgePercent, signalStrength, direction };
}

/**
 * Filter edges to only significant opportunities (default 10%+)
 */
export function filterSignificantEdges(
  edges: EdgeOpportunity[],
  minEdgePercent: number = 10
): EdgeOpportunity[] {
  return edges
    .filter(e => Math.abs(e.edgePercent) >= minEdgePercent)
    .sort((a, b) => Math.abs(b.edgePercent) - Math.abs(a.edgePercent));
}

/**
 * Calculate 24h price change from history
 */
export function calculatePriceChange24h(
  priceHistory: Array<{ timestamp: Date; probability: number }>
): number | null {
  if (priceHistory.length < 2) return null;

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find closest price to 24h ago
  const oldPrice = priceHistory
    .filter(p => new Date(p.timestamp) <= twentyFourHoursAgo)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (!oldPrice) return null;

  const currentPrice = priceHistory[priceHistory.length - 1];
  const change = (currentPrice.probability - oldPrice.probability) * 100;

  return Math.round(change * 10) / 10;
}

/**
 * Generate human-readable reasoning for why we think this is mispriced
 */
export function generateReasoning(params: {
  direction: 'BUY' | 'AVOID';
  edgePercent: number;
  momentumScore: number;
  accelerationScore: number;
  forecastP50: number | null;
  forecastP10: number | null;
  forecastP90: number | null;
  historicalPattern: string;
  marketProbability: number;
}): string {
  const {
    direction,
    momentumScore,
    accelerationScore,
    forecastP50,
    forecastP10,
    forecastP90,
    historicalPattern,
    marketProbability,
  } = params;

  const reasons: string[] = [];

  if (direction === 'BUY') {
    // Underpriced - we think it's better than market suggests
    if (forecastP50 !== null && forecastP50 <= 2) {
      reasons.push(`Model forecasts #${forecastP50} rank`);
    }
    if (momentumScore >= 70) {
      reasons.push(`High momentum (${momentumScore})`);
    } else if (momentumScore >= 55) {
      reasons.push(`Good momentum (${momentumScore})`);
    }
    if (accelerationScore > 10) {
      reasons.push('Trending up');
    }
    if (historicalPattern === 'climbing_fast') {
      reasons.push('Climbing fast in charts');
    } else if (historicalPattern === 'climbing_slow') {
      reasons.push('Steadily climbing');
    }
    if (forecastP90 !== null && forecastP90 <= 3) {
      reasons.push(`Even worst case is top ${forecastP90}`);
    }
    if (marketProbability < 0.1) {
      reasons.push('Market undervaluing');
    }
  } else {
    // Overpriced - market is too bullish
    if (forecastP50 !== null && forecastP50 > 3) {
      reasons.push(`Model forecasts only #${forecastP50}`);
    }
    if (momentumScore < 40) {
      reasons.push(`Low momentum (${momentumScore})`);
    } else if (momentumScore < 55) {
      reasons.push(`Moderate momentum (${momentumScore})`);
    }
    if (accelerationScore < -10) {
      reasons.push('Losing steam');
    }
    if (historicalPattern === 'falling_fast') {
      reasons.push('Falling fast in charts');
    } else if (historicalPattern === 'falling_slow') {
      reasons.push('Slowly declining');
    }
    if (forecastP10 !== null && forecastP10 > 2) {
      reasons.push(`Even best case is only #${forecastP10}`);
    }
    if (marketProbability > 0.7) {
      reasons.push('Market may be overconfident');
    }
  }

  if (reasons.length === 0) {
    return direction === 'BUY'
      ? 'Model sees upside potential'
      : 'Model sees downside risk';
  }

  return reasons.slice(0, 3).join(' | ');
}
