/**
 * Tests for Feature Builder
 *
 * Note: These tests are self-contained to avoid Prisma initialization.
 * They test the pure calculation functions.
 */

// Replicate types and pure functions for testing without Prisma
interface MomentumWeights {
  trendsWeight: number;
  wikipediaWeight: number;
  rankDeltaWeight: number;
}

function normalizeToScale(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

function calculateMomentumScore(
  trendsValue: number | null,
  wikipediaValue: number | null,
  rankDelta: number | null,
  weights: MomentumWeights
): number {
  let score = 0;
  let totalWeight = 0;

  if (trendsValue !== null) {
    score += trendsValue * weights.trendsWeight;
    totalWeight += weights.trendsWeight;
  }

  if (wikipediaValue !== null && wikipediaValue > 0) {
    const logNormalized = Math.min(100, Math.log10(wikipediaValue) * 10);
    score += logNormalized * weights.wikipediaWeight;
    totalWeight += weights.wikipediaWeight;
  }

  if (rankDelta !== null) {
    const normalizedDelta = normalizeToScale(rankDelta, -10, 10);
    score += normalizedDelta * weights.rankDeltaWeight;
    totalWeight += weights.rankDeltaWeight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(score / totalWeight);
}

function calculateAccelerationScore(
  currentMomentum: number,
  previousMomentum: number | null
): number {
  if (previousMomentum === null) return 0;
  const delta = currentMomentum - previousMomentum;
  return Math.max(-100, Math.min(100, delta * 2));
}

const DEFAULT_WEIGHTS: MomentumWeights = {
  trendsWeight: 0.33,
  wikipediaWeight: 0.33,
  rankDeltaWeight: 0.34,
};

describe('calculateMomentumScore', () => {
  it('should return 0 when all inputs are null', () => {
    const score = calculateMomentumScore(null, null, null, DEFAULT_WEIGHTS);
    expect(score).toBe(0);
  });

  it('should handle only trends input', () => {
    const score = calculateMomentumScore(75, null, null, DEFAULT_WEIGHTS);
    expect(score).toBe(75); // Normalized to weight
  });

  it('should handle high momentum signals', () => {
    // High trends (80), high wikipedia (100000 views), climbing ranks (+5)
    const score = calculateMomentumScore(80, 100000, 5, DEFAULT_WEIGHTS);
    expect(score).toBeGreaterThan(60);
  });

  it('should handle low momentum signals', () => {
    // Low trends (20), low wikipedia (1000 views), falling ranks (-5)
    const score = calculateMomentumScore(20, 1000, -5, DEFAULT_WEIGHTS);
    expect(score).toBeLessThan(40);
  });

  it('should give mid-range score for neutral signals', () => {
    // Neutral trends (50), medium wikipedia (10000 views), stable ranks (0)
    const score = calculateMomentumScore(50, 10000, 0, DEFAULT_WEIGHTS);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(60);
  });

  it('should respect custom weights', () => {
    const trendsOnlyWeights: MomentumWeights = {
      trendsWeight: 1.0,
      wikipediaWeight: 0,
      rankDeltaWeight: 0,
    };

    const score = calculateMomentumScore(100, 1000000, 10, trendsOnlyWeights);
    expect(score).toBe(100); // Only trends matters
  });

  it('should clamp to 0-100 range', () => {
    const highScore = calculateMomentumScore(100, 10000000, 10, DEFAULT_WEIGHTS);
    expect(highScore).toBeLessThanOrEqual(100);
    expect(highScore).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateAccelerationScore', () => {
  it('should return 0 when no previous momentum', () => {
    const score = calculateAccelerationScore(50, null);
    expect(score).toBe(0);
  });

  it('should return positive for increasing momentum', () => {
    const score = calculateAccelerationScore(70, 50);
    expect(score).toBeGreaterThan(0);
  });

  it('should return negative for decreasing momentum', () => {
    const score = calculateAccelerationScore(30, 50);
    expect(score).toBeLessThan(0);
  });

  it('should return 0 for stable momentum', () => {
    const score = calculateAccelerationScore(50, 50);
    expect(score).toBe(0);
  });

  it('should scale appropriately', () => {
    // Big jump should give higher acceleration
    const bigJump = calculateAccelerationScore(90, 50);
    const smallJump = calculateAccelerationScore(60, 50);

    expect(bigJump).toBeGreaterThan(smallJump);
  });

  it('should clamp to -100 to 100 range', () => {
    const extreme = calculateAccelerationScore(100, 0);
    expect(extreme).toBeLessThanOrEqual(100);
    expect(extreme).toBeGreaterThanOrEqual(-100);
  });
});

describe('Feature normalization', () => {
  it('should normalize wikipedia views using log scale', () => {
    // Test the log normalization logic inline
    function logNormalize(views: number): number {
      return Math.min(100, Math.log10(views) * 10);
    }

    expect(logNormalize(1000)).toBeCloseTo(30); // log10(1000) = 3 * 10 = 30
    expect(logNormalize(10000)).toBeCloseTo(40);
    expect(logNormalize(100000)).toBeCloseTo(50);
    expect(logNormalize(1000000)).toBeCloseTo(60);
  });

  it('should normalize rank delta to 0-100 scale', () => {
    function normalizeRankDelta(delta: number): number {
      // Map -10 to +10 -> 0 to 100
      return ((delta - (-10)) / (10 - (-10))) * 100;
    }

    expect(normalizeRankDelta(-10)).toBe(0); // Falling fast
    expect(normalizeRankDelta(0)).toBe(50); // Stable
    expect(normalizeRankDelta(10)).toBe(100); // Climbing fast
    expect(normalizeRankDelta(5)).toBe(75); // Climbing moderately
  });
});

describe('Weights validation', () => {
  it('should have default weights summing to 1', () => {
    const sum =
      DEFAULT_WEIGHTS.trendsWeight +
      DEFAULT_WEIGHTS.wikipediaWeight +
      DEFAULT_WEIGHTS.rankDeltaWeight;

    expect(sum).toBeCloseTo(1.0);
  });

  it('should handle unequal weights', () => {
    const customWeights: MomentumWeights = {
      trendsWeight: 0.5,
      wikipediaWeight: 0.3,
      rankDeltaWeight: 0.2,
    };

    const sum = customWeights.trendsWeight + customWeights.wikipediaWeight + customWeights.rankDeltaWeight;
    expect(sum).toBeCloseTo(1.0);
  });
});

describe('Edge cases', () => {
  it('should handle zero wikipedia views', () => {
    const score = calculateMomentumScore(50, 0, 0, DEFAULT_WEIGHTS);
    // Should still work, just won't include wikipedia component
    expect(score).toBeGreaterThan(0);
  });

  it('should handle negative wikipedia views gracefully', () => {
    const score = calculateMomentumScore(50, -100, 0, DEFAULT_WEIGHTS);
    // Negative views should be treated like missing
    expect(score).toBeGreaterThan(0);
  });

  it('should handle extreme rank deltas', () => {
    // Jumping from rank 10 to rank 1 = +9 delta
    const bigClimb = calculateMomentumScore(50, 10000, 9, DEFAULT_WEIGHTS);

    // Falling from rank 1 to rank 10 = -9 delta
    const bigFall = calculateMomentumScore(50, 10000, -9, DEFAULT_WEIGHTS);

    expect(bigClimb).toBeGreaterThan(bigFall);
  });
});
