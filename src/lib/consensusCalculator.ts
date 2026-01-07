/**
 * Consensus Calculator
 *
 * Computes weighted average predictions across multiple odds sources
 * to generate the "PredictEasy Best Estimate"
 */

import { OddsSource } from '@prisma/client';

/**
 * Default weights for each source
 * Higher weight = more influence on final estimate
 */
const DEFAULT_WEIGHTS: Record<OddsSource, number> = {
  POLYMARKET: 0.35,    // Prediction market - highest liquidity, real money
  MYBOOKIE: 0.15,      // Major sportsbook
  BOVADA: 0.15,        // Major sportsbook
  GOLDDERBY: 0.25,     // Expert consensus - aggregates many experts
  DRAFTKINGS: 0.05,    // Limited entertainment betting
  BETMGM: 0.05,        // Limited entertainment betting
};

export interface OddsInput {
  source: OddsSource;
  probability: number;  // 0-1
}

export interface ConsensusResult {
  probability: number;           // 0-1 weighted average
  confidence: 'high' | 'medium' | 'low';
  agreement: number;             // 0-1, how closely sources agree
  sourceCount: number;           // How many sources contributed
  breakdown: Record<string, number>;  // Probability from each source
}

/**
 * Calculate standard deviation for agreement score
 */
function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate consensus probability for a nominee
 *
 * @param odds - Array of odds from different sources
 * @returns ConsensusResult with weighted average and confidence metrics
 */
export function calculateConsensus(odds: OddsInput[]): ConsensusResult {
  if (odds.length === 0) {
    return {
      probability: 0,
      confidence: 'low',
      agreement: 0,
      sourceCount: 0,
      breakdown: {},
    };
  }

  // Build breakdown and calculate weighted sum
  const breakdown: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;
  const probabilities: number[] = [];

  for (const { source, probability } of odds) {
    breakdown[source] = probability;
    probabilities.push(probability);

    const weight = DEFAULT_WEIGHTS[source] || 0.05;
    weightedSum += probability * weight;
    totalWeight += weight;
  }

  // Normalize by redistributing missing source weights
  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate agreement (inverse of normalized std dev)
  // Lower std dev = higher agreement
  const stdDev = calculateStdDev(probabilities);
  // Max std dev for binary outcome is 0.5 (one at 0%, one at 100%)
  const normalizedStdDev = Math.min(stdDev / 0.5, 1);
  const agreement = 1 - normalizedStdDev;

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (odds.length >= 3 && agreement >= 0.8) {
    confidence = 'high';
  } else if (odds.length >= 2 && agreement >= 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    probability: consensus,
    confidence,
    agreement,
    sourceCount: odds.length,
    breakdown,
  };
}

/**
 * Calculate consensus for all nominees in a category
 * Returns nominees sorted by consensus probability (descending)
 */
export interface NomineeWithOdds {
  id: string;
  name: string;
  subtitle: string | null;
  isWinner: boolean;
  odds: Array<{
    source: string;
    probability: number;
    url?: string | null;
  }>;
  // Optional fields that may be present
  polymarketOdds?: number | null;
  maxEdge?: number | null;
  edgeSource?: string | null;
}

export type NomineeConsensus<T extends NomineeWithOdds = NomineeWithOdds> = T & {
  consensus: ConsensusResult;
};

export function calculateCategoryConsensus<T extends NomineeWithOdds>(
  nominees: T[]
): NomineeConsensus<T>[] {
  return nominees
    .map(nominee => ({
      ...nominee,
      consensus: calculateConsensus(
        nominee.odds.map(o => ({
          source: o.source as OddsSource,
          probability: o.probability,
        }))
      ),
    }))
    .sort((a, b) => b.consensus.probability - a.consensus.probability);
}

/**
 * Get human-readable explanation for the estimate
 */
export function getConsensusExplanation(result: ConsensusResult): string {
  const sources = Object.keys(result.breakdown);
  const percentage = Math.round(result.probability * 100);

  if (result.sourceCount === 0) {
    return 'No odds data available';
  }

  if (result.confidence === 'high') {
    return `${percentage}% consensus across ${result.sourceCount} sources with strong agreement`;
  }

  if (result.confidence === 'medium') {
    return `${percentage}% estimate from ${result.sourceCount} sources`;
  }

  return `${percentage}% estimate (limited data from ${sources.join(', ')})`;
}
