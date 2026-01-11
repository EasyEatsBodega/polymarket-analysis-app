/**
 * Title Comparison API Endpoint
 *
 * Compares multiple titles head-to-head using various signals:
 * - Google Trends (search interest momentum)
 * - FlixPatrol rankings (current performance)
 * - Model predictions
 *
 * Useful for analyzing competing new entrants like "His & Hers vs Run Away"
 *
 * GET /api/compare-titles?titles=His%20%26%20Hers,Run%20Away
 * POST /api/compare-titles { titles: ["His & Hers", "Run Away"] }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { compareTitlesHead2Head } from '@/jobs/ingestGoogleTrends';
import { normalizeTitle } from '@/lib/titleNormalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ComparisonResult {
  name: string;
  titleId: string | null;
  // FlixPatrol data
  flixPatrolRank: number | null;
  flixPatrolPoints: number | null;
  flixPatrolTrend: 'rising' | 'falling' | 'stable' | null;
  flixPatrolRankChange: number | null;
  // Google Trends
  trendsUS: number | null;
  trendsGlobal: number | null;
  trendsMomentum: 'rising' | 'falling' | 'stable' | null;
  // Model prediction
  predictedRank: number | null;
  modelConfidence: string | null;
  modelProbability: number | null;
  // Composite scores
  overallScore: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
}

/**
 * Get FlixPatrol trend for a title over recent days
 */
async function getFlixPatrolData(titleId: string): Promise<{
  currentRank: number | null;
  points: number | null;
  trend: 'rising' | 'falling' | 'stable';
  rankChange: number | null;
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const entries = await prisma.flixPatrolDaily.findMany({
    where: {
      titleId,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { date: 'asc' },
    select: { rank: true, points: true, date: true },
  });

  if (entries.length === 0) {
    return { currentRank: null, points: null, trend: 'stable', rankChange: null };
  }

  const latest = entries[entries.length - 1];
  const oldest = entries[0];

  // Rank change: negative = improving (climbing), positive = falling
  const rankChange = entries.length > 1 ? latest.rank - oldest.rank : null;

  let trend: 'rising' | 'falling' | 'stable' = 'stable';
  if (rankChange !== null) {
    if (rankChange < -1) trend = 'rising';    // Rank improved (lower number)
    else if (rankChange > 1) trend = 'falling'; // Rank worsened (higher number)
  }

  return {
    currentRank: latest.rank,
    points: latest.points,
    trend,
    rankChange,
  };
}

/**
 * Get recent Google Trends data from database
 */
async function getTrendsData(titleId: string): Promise<{
  trendsUS: number | null;
  trendsGlobal: number | null;
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const signals = await prisma.dailySignal.findMany({
    where: {
      titleId,
      source: 'TRENDS',
      date: { gte: sevenDaysAgo },
    },
    select: { geo: true, value: true },
  });

  const usSignals = signals.filter((s: { geo: string; value: number }) => s.geo === 'US');
  const globalSignals = signals.filter((s: { geo: string; value: number }) => s.geo === 'GLOBAL');

  const trendsUS = usSignals.length > 0
    ? Math.round(usSignals.reduce((sum: number, s: { value: number }) => sum + s.value, 0) / usSignals.length)
    : null;

  const trendsGlobal = globalSignals.length > 0
    ? Math.round(globalSignals.reduce((sum: number, s: { value: number }) => sum + s.value, 0) / globalSignals.length)
    : null;

  return { trendsUS, trendsGlobal };
}

/**
 * Get model prediction for a title
 */
async function getModelPrediction(titleId: string): Promise<{
  predictedRank: number | null;
  confidence: string | null;
  probability: number | null;
}> {
  const forecast = await prisma.forecastWeekly.findFirst({
    where: {
      titleId,
      target: 'RANK',
    },
    orderBy: { weekStart: 'desc' },
    select: { p50: true, explainJson: true },
  });

  if (!forecast) {
    return { predictedRank: null, confidence: null, probability: null };
  }

  const explain = forecast.explainJson as { confidence?: string; polymarketProbability?: number } | null;

  return {
    predictedRank: forecast.p50,
    confidence: explain?.confidence || null,
    probability: explain?.polymarketProbability || null,
  };
}

/**
 * Calculate overall score and recommendation
 */
function calculateOverallScore(
  flixPatrolRank: number | null,
  flixPatrolTrend: string | null,
  trendsUS: number | null,
  trendsGlobal: number | null,
  predictedRank: number | null
): { score: number; recommendation: ComparisonResult['recommendation'] } {
  let score = 50; // Base neutral score

  // FlixPatrol rank contribution (0-35 points)
  if (flixPatrolRank !== null) {
    if (flixPatrolRank === 1) score += 35;
    else if (flixPatrolRank <= 3) score += 30;
    else if (flixPatrolRank <= 5) score += 25;
    else if (flixPatrolRank <= 10) score += 20 - (flixPatrolRank - 5) * 2;
    else score += Math.max(0, 10 - (flixPatrolRank - 10));
  }

  // FlixPatrol trend contribution (-10 to +10 points)
  if (flixPatrolTrend === 'rising') score += 10;
  else if (flixPatrolTrend === 'falling') score -= 10;

  // Google Trends contribution (0-15 points)
  const maxTrends = Math.max(trendsUS || 0, trendsGlobal || 0);
  score += Math.round(maxTrends * 0.15);

  // Model prediction alignment (-5 to +5 points)
  if (predictedRank !== null && flixPatrolRank !== null) {
    const diff = flixPatrolRank - predictedRank;
    if (diff > 2) score += 5; // Model predicts improvement
    else if (diff < -2) score -= 5; // Model predicts decline
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine recommendation
  let recommendation: ComparisonResult['recommendation'];
  if (score >= 80) recommendation = 'STRONG_BUY';
  else if (score >= 65) recommendation = 'BUY';
  else if (score >= 45) recommendation = 'HOLD';
  else if (score >= 30) recommendation = 'SELL';
  else recommendation = 'STRONG_SELL';

  return { score, recommendation };
}

export async function GET(request: NextRequest) {
  const titlesParam = request.nextUrl.searchParams.get('titles');

  if (!titlesParam) {
    return NextResponse.json(
      { error: 'Missing required parameter: titles (comma-separated list)' },
      { status: 400 }
    );
  }

  const titleNames = titlesParam.split(',').map((t) => t.trim()).filter(Boolean);

  if (titleNames.length < 2) {
    return NextResponse.json(
      { error: 'Need at least 2 titles to compare' },
      { status: 400 }
    );
  }

  if (titleNames.length > 5) {
    return NextResponse.json(
      { error: 'Maximum 5 titles can be compared at once' },
      { status: 400 }
    );
  }

  try {
    const results: ComparisonResult[] = [];

    // Find titles in database
    const allTitles = await prisma.title.findMany({
      select: { id: true, canonicalName: true, type: true },
    });

    for (const name of titleNames) {
      const normalizedName = normalizeTitle(name);

      // Find matching title
      const matchedTitle = allTitles.find((t: { id: string; canonicalName: string; type: string }) => {
        const normalizedCanonical = normalizeTitle(t.canonicalName);
        return (
          normalizedCanonical.normalized === normalizedName.normalized ||
          t.canonicalName.toLowerCase() === name.toLowerCase()
        );
      });

      // Get data for this title
      const flixPatrol = matchedTitle
        ? await getFlixPatrolData(matchedTitle.id)
        : { currentRank: null, points: null, trend: 'stable' as const, rankChange: null };

      const trends = matchedTitle
        ? await getTrendsData(matchedTitle.id)
        : { trendsUS: null, trendsGlobal: null };

      const prediction = matchedTitle
        ? await getModelPrediction(matchedTitle.id)
        : { predictedRank: null, confidence: null, probability: null };

      // Calculate trends momentum based on stored data
      let trendsMomentum: 'rising' | 'falling' | 'stable' | null = null;
      if (trends.trendsGlobal !== null || trends.trendsUS !== null) {
        // We'd need historical data to determine momentum, for now assume stable
        trendsMomentum = 'stable';
      }

      // Calculate overall score
      const { score, recommendation } = calculateOverallScore(
        flixPatrol.currentRank,
        flixPatrol.trend,
        trends.trendsUS,
        trends.trendsGlobal,
        prediction.predictedRank
      );

      results.push({
        name,
        titleId: matchedTitle?.id || null,
        flixPatrolRank: flixPatrol.currentRank,
        flixPatrolPoints: flixPatrol.points,
        flixPatrolTrend: flixPatrol.trend,
        flixPatrolRankChange: flixPatrol.rankChange,
        trendsUS: trends.trendsUS,
        trendsGlobal: trends.trendsGlobal,
        trendsMomentum,
        predictedRank: prediction.predictedRank,
        modelConfidence: prediction.confidence,
        modelProbability: prediction.probability,
        overallScore: score,
        recommendation,
      });
    }

    // Sort by overall score (highest first)
    results.sort((a, b) => b.overallScore - a.overallScore);

    // Determine winner
    const winner = results[0];
    const runnerUp = results[1];

    // Generate analysis
    let analysis = `Based on combined signals, "${winner.name}" has the highest probability of reaching #1.`;

    if (winner.flixPatrolRank === 1) {
      analysis += ` Currently holding the top spot`;
      if (winner.flixPatrolTrend === 'rising') {
        analysis += ' with strong momentum.';
      } else if (winner.flixPatrolTrend === 'falling') {
        analysis += ', but showing signs of decline.';
      } else {
        analysis += ' with stable viewership.';
      }
    } else if (winner.flixPatrolRank !== null && winner.flixPatrolRank <= 3) {
      analysis += ` Currently ranked #${winner.flixPatrolRank}`;
      if (winner.flixPatrolTrend === 'rising') {
        analysis += ' and climbing fast.';
      } else {
        analysis += '.';
      }
    }

    if (runnerUp && runnerUp.overallScore >= winner.overallScore - 10) {
      analysis += ` However, "${runnerUp.name}" is close behind and could overtake.`;
    }

    return NextResponse.json({
      success: true,
      titles: results,
      winner: winner.name,
      analysis,
      comparisonDate: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Title comparison failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titles, fetchLive = false } = body;

    if (!Array.isArray(titles) || titles.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 titles to compare' },
        { status: 400 }
      );
    }

    // If fetchLive is true, fetch fresh Google Trends data
    if (fetchLive) {
      console.log('Fetching live Google Trends comparison...');
      const trendsComparison = await compareTitlesHead2Head(titles);

      return NextResponse.json({
        success: true,
        liveTrendsData: Object.fromEntries(trendsComparison.comparison),
        trendsWinner: trendsComparison.winner,
        trendsAnalysis: trendsComparison.analysis,
      });
    }

    // Otherwise, redirect to GET with titles as query param
    const titlesParam = titles.join(',');
    const url = new URL(request.url);
    url.searchParams.set('titles', titlesParam);

    return GET(new NextRequest(url));
  } catch (error) {
    console.error('Title comparison failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
