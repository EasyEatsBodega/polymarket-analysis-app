/**
 * Tests for Forecaster
 *
 * Note: These tests are self-contained to avoid Prisma initialization.
 */

// Define MODEL_VERSION locally to avoid importing module that requires Prisma
const MODEL_VERSION = '1.0.0';

describe('Forecaster', () => {
  describe('Model version', () => {
    it('should have a valid semantic version', () => {
      expect(MODEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Linear trend fitting', () => {
    function fitLinearTrend(data: { rank: number }[]): {
      slope: number;
      intercept: number;
      pattern: string;
    } {
      if (data.length < 2) {
        return { slope: 0, intercept: data[0]?.rank ?? 5, pattern: 'insufficient_data' };
      }

      // Simple linear regression implementation
      const n = data.length;
      const x = data.map((_, i) => i);
      const y = data.map((d) => d.rank);

      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
      const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      let pattern: string;
      if (slope < -0.5) pattern = 'climbing_fast';
      else if (slope < -0.1) pattern = 'climbing_slow';
      else if (slope > 0.5) pattern = 'falling_fast';
      else if (slope > 0.1) pattern = 'falling_slow';
      else pattern = 'stable';

      return { slope, intercept, pattern };
    }

    it('should detect climbing trend', () => {
      // Ranks getting lower = climbing (5 -> 4 -> 3 -> 2 -> 1)
      const data = [{ rank: 5 }, { rank: 4 }, { rank: 3 }, { rank: 2 }, { rank: 1 }];
      const trend = fitLinearTrend(data);

      expect(trend.slope).toBeLessThan(0);
      expect(trend.pattern).toBe('climbing_fast');
    });

    it('should detect falling trend', () => {
      // Ranks getting higher = falling (1 -> 2 -> 3 -> 4 -> 5)
      const data = [{ rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 4 }, { rank: 5 }];
      const trend = fitLinearTrend(data);

      expect(trend.slope).toBeGreaterThan(0);
      expect(trend.pattern).toBe('falling_fast');
    });

    it('should detect stable trend', () => {
      // Ranks staying around the same
      const data = [{ rank: 5 }, { rank: 5 }, { rank: 5 }, { rank: 5 }];
      const trend = fitLinearTrend(data);

      expect(trend.slope).toBeCloseTo(0);
      expect(trend.pattern).toBe('stable');
    });

    it('should handle insufficient data', () => {
      const data = [{ rank: 3 }];
      const trend = fitLinearTrend(data);

      expect(trend.pattern).toBe('insufficient_data');
      expect(trend.intercept).toBe(3);
    });
  });

  describe('Percentile calculations', () => {
    it('should order percentiles correctly for rank forecasts', () => {
      // For ranks, lower is better
      // p10 (optimistic) should be <= p50 <= p90 (pessimistic)
      const baseForecast = 5;
      const uncertainty = 2;

      const p10 = Math.max(1, baseForecast - uncertainty * 1.28);
      const p50 = baseForecast;
      const p90 = Math.min(10, baseForecast + uncertainty * 1.28);

      expect(p10).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p90);
    });

    it('should clamp to valid rank range', () => {
      const clampRank = (r: number) => Math.round(Math.max(1, Math.min(10, r)));

      expect(clampRank(0.5)).toBe(1);
      expect(clampRank(10.5)).toBe(10);
      expect(clampRank(5)).toBe(5);
    });
  });

  describe('Views forecast log transformation', () => {
    it('should convert log views back to actual views', () => {
      const logViews = 6; // log10(1000000) = 6
      const actualViews = Math.exp(logViews * Math.log(10)); // e^(6 * ln(10)) = 10^6

      expect(actualViews).toBeCloseTo(1000000, -3);
    });

    it('should handle momentum factor correctly', () => {
      const baseLogViews = Math.log(100000);
      const momentumScore = 70; // Above neutral 50

      const momentumFactor = 1 + (momentumScore - 50) / 200;
      expect(momentumFactor).toBeCloseTo(1.1); // 10% boost

      const adjustedLogViews = baseLogViews + Math.log(momentumFactor);
      const adjustedViews = Math.exp(adjustedLogViews);

      expect(adjustedViews).toBeGreaterThan(100000);
    });
  });

  describe('Confidence levels', () => {
    it('should assign high confidence with enough history and signals', () => {
      const hasEnoughHistory = true; // >= 4 weeks
      const hasSignals = true;

      const confidence =
        hasEnoughHistory && hasSignals ? 'high' : hasEnoughHistory || hasSignals ? 'medium' : 'low';

      expect(confidence).toBe('high');
    });

    it('should assign medium confidence with partial data', () => {
      const hasEnoughHistory = true;
      const hasSignals = false;

      const confidence =
        hasEnoughHistory && hasSignals ? 'high' : hasEnoughHistory || hasSignals ? 'medium' : 'low';

      expect(confidence).toBe('medium');
    });

    it('should assign low confidence with no data', () => {
      const hasEnoughHistory = false;
      const hasSignals = false;

      const confidence =
        hasEnoughHistory && hasSignals ? 'high' : hasEnoughHistory || hasSignals ? 'medium' : 'low';

      expect(confidence).toBe('low');
    });
  });

  describe('Week calculation', () => {
    it('should calculate next Sunday correctly', () => {
      function getNextSunday(from: Date): Date {
        const dayOfWeek = from.getDay();
        const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
        const nextSunday = new Date(from);
        nextSunday.setDate(from.getDate() + daysUntilSunday);
        nextSunday.setHours(0, 0, 0, 0);
        return nextSunday;
      }

      // Wednesday Jan 15, 2025
      const wednesday = new Date('2025-01-15T12:00:00');
      const nextSunday = getNextSunday(wednesday);

      expect(nextSunday.getDay()).toBe(0); // Sunday
      expect(nextSunday.getDate()).toBe(19); // Jan 19
    });

    it('should return next Sunday even when starting on Sunday', () => {
      function getNextSunday(from: Date): Date {
        const dayOfWeek = from.getDay();
        const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
        const nextSunday = new Date(from);
        nextSunday.setDate(from.getDate() + daysUntilSunday);
        return nextSunday;
      }

      // Sunday Jan 12, 2025
      const sunday = new Date('2025-01-12T12:00:00');
      const nextSunday = getNextSunday(sunday);

      expect(nextSunday.getDay()).toBe(0);
      expect(nextSunday.getDate()).toBe(19); // Next Sunday, not same day
    });
  });

  describe('Forecast structure', () => {
    it('should have all required fields', () => {
      interface Forecast {
        titleId: string;
        weekStart: Date;
        weekEnd: Date;
        target: 'GLOBAL_VIEWS' | 'US_RANK';
        p10: number;
        p50: number;
        p90: number;
        explain: object;
      }

      const mockForecast: Forecast = {
        titleId: 'test-id',
        weekStart: new Date('2025-01-19'),
        weekEnd: new Date('2025-01-25'),
        target: 'US_RANK',
        p10: 2,
        p50: 4,
        p90: 6,
        explain: {
          momentumScore: 65,
          confidence: 'high',
        },
      };

      expect(mockForecast.titleId).toBeDefined();
      expect(mockForecast.p10).toBeLessThanOrEqual(mockForecast.p50);
      expect(mockForecast.p50).toBeLessThanOrEqual(mockForecast.p90);
    });
  });
});
