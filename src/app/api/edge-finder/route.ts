/**
 * Edge Finder API
 *
 * Compares model forecasts against Polymarket odds to identify
 * mispriced markets and trading opportunities.
 *
 * Shows two types of signals:
 * - model_edge: When we have forecast data, compares model vs market
 * - market_momentum: When no forecast, shows price trend signals
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  calculateModelProbability,
  calculateEdge,
  generateReasoning,
  generateMomentumReasoning,
  calculateMomentumSignal,
  EdgeOpportunity,
} from '@/lib/edgeCalculator';
import { matchOutcomeToTitle, buildTitleCache } from '@/lib/marketMatcher';

export const dynamic = 'force-dynamic';

interface ParsedOutcome {
  name: string;
  probability: number;
  volume: number;
}

interface ParsedMarket {
  slug: string;
  label: string;
  question: string;
  category: string;
  rank: number;
  outcomes: ParsedOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

// Response can be either an array (when filtered by tab) or grouped object (all markets)
type PolymarketData = ParsedMarket[] | Record<string, ParsedMarket[]>;

interface PolymarketApiResponse {
  success: boolean;
  data: PolymarketData;
  meta: {
    tab?: string;
    totalMarkets?: number;
    count?: number;
    fetchedAt: string;
  };
}

// Helper to flatten grouped data into array
function flattenMarkets(data: PolymarketData): ParsedMarket[] {
  if (Array.isArray(data)) {
    return data;
  }
  // It's a grouped object - flatten all categories
  return Object.values(data).flat();
}

export interface EdgeFinderResponse {
  success: boolean;
  data: EdgeOpportunity[];
  meta: {
    totalEdges: number;
    modelEdges: number;
    momentumSignals: number;
    strongSignals: number;
    moderateSignals: number;
    buySignals: number;
    avoidSignals: number;
    avgEdge: number;
    fetchedAt: string;
  };
  error?: string;
}

// Calculate price changes from snapshots
async function getPriceChanges(marketSlug: string): Promise<{
  priceChange24h: number | null;
  priceChange7d: number | null;
  prices: Record<string, { current: number; h24: number | null; d7: number | null }>;
}> {
  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Find market record
  const market = await prisma.polymarketMarket.findFirst({
    where: { slug: marketSlug },
    select: { id: true },
  });

  if (!market) {
    return { priceChange24h: null, priceChange7d: null, prices: {} };
  }

  // Get recent snapshots
  const snapshots = await prisma.marketPriceSnapshot.findMany({
    where: {
      marketId: market.id,
      timestamp: { gte: d7Ago },
    },
    orderBy: { timestamp: 'desc' },
    take: 200,
  });

  if (snapshots.length === 0) {
    return { priceChange24h: null, priceChange7d: null, prices: {} };
  }

  const currentSnapshot = snapshots[0];
  const currentPrices = currentSnapshot.prices as Record<string, number>;

  // Find snapshots closest to 24h and 7d ago
  const snapshot24h = snapshots.find(s => new Date(s.timestamp) <= h24Ago);
  const snapshot7d = snapshots.find(s => new Date(s.timestamp) <= d7Ago);

  const prices: Record<string, { current: number; h24: number | null; d7: number | null }> = {};

  for (const [name, currentPrice] of Object.entries(currentPrices)) {
    const h24Price = snapshot24h ? (snapshot24h.prices as Record<string, number>)[name] : null;
    const d7Price = snapshot7d ? (snapshot7d.prices as Record<string, number>)[name] : null;

    prices[name] = {
      current: currentPrice,
      h24: h24Price ?? null,
      d7: d7Price ?? null,
    };
  }

  // Calculate overall market price change (average across outcomes)
  let totalChange24h = 0;
  let count24h = 0;
  let totalChange7d = 0;
  let count7d = 0;

  for (const priceData of Object.values(prices)) {
    if (priceData.h24 !== null) {
      totalChange24h += (priceData.current - priceData.h24) * 100;
      count24h++;
    }
    if (priceData.d7 !== null) {
      totalChange7d += (priceData.current - priceData.d7) * 100;
      count7d++;
    }
  }

  return {
    priceChange24h: count24h > 0 ? totalChange24h / count24h : null,
    priceChange7d: count7d > 0 ? totalChange7d / count7d : null,
    prices,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse<EdgeFinderResponse>> {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const minEdge = parseFloat(searchParams.get('minEdge') || '5'); // Lower default for momentum
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const signalTypeFilter = searchParams.get('signalType'); // 'model_edge', 'market_momentum', or null for all

    // 1. Fetch current Polymarket data
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';
    const polymarketUrl = category
      ? `${baseUrl}/api/polymarket-netflix?tab=${category}`
      : `${baseUrl}/api/polymarket-netflix`;

    const polymarketResponse = await fetch(polymarketUrl, {
      next: { revalidate: 60 },
    });
    const polymarketData: PolymarketApiResponse = await polymarketResponse.json();

    if (!polymarketData.success) {
      throw new Error('Failed to fetch Polymarket data');
    }

    // 2. Build title cache for matching
    const titles = await prisma.title.findMany({
      select: { id: true, canonicalName: true, aliases: true },
      cacheStrategy: { ttl: 300 },
    });
    const titleCache = buildTitleCache(titles);

    // 3. Get latest forecasts with momentum data
    const latestWeek = await prisma.forecastWeekly.findFirst({
      orderBy: { weekStart: 'desc' },
      select: { weekStart: true },
      cacheStrategy: { ttl: 300 },
    });

    const forecasts = latestWeek
      ? await prisma.forecastWeekly.findMany({
          where: {
            weekStart: latestWeek.weekStart,
            target: 'RANK',
          },
          include: {
            title: {
              select: { canonicalName: true },
            },
          },
          cacheStrategy: { ttl: 300 },
        })
      : [];

    const forecastMap = new Map(forecasts.map(f => [f.titleId, f]));

    // 4. Process markets and calculate edges
    const edges: EdgeOpportunity[] = [];
    const marketsToProcess = flattenMarkets(polymarketData.data);

    // Fetch price history for all markets (in parallel)
    const priceDataMap = new Map<string, Awaited<ReturnType<typeof getPriceChanges>>>();
    await Promise.all(
      marketsToProcess.map(async (market) => {
        const priceData = await getPriceChanges(market.slug);
        priceDataMap.set(market.slug, priceData);
      })
    );

    for (const market of marketsToProcess) {
      const priceData = priceDataMap.get(market.slug);

      for (const outcome of market.outcomes) {
        // Skip "Other" outcomes
        if (outcome.name.toLowerCase() === 'other') continue;

        // Match to title
        const match = matchOutcomeToTitle(outcome.name, titleCache);

        // Get forecast data (may not have a match)
        const forecast = match.matchedTitleId
          ? forecastMap.get(match.matchedTitleId)
          : null;

        // Get price data for this outcome
        const outcomePriceData = priceData?.prices[outcome.name];
        const priceChange24h = outcomePriceData?.h24 !== null && outcomePriceData?.h24 !== undefined
          ? (outcomePriceData.current - outcomePriceData.h24) * 100
          : null;
        const priceChange7d = outcomePriceData?.d7 !== null && outcomePriceData?.d7 !== undefined
          ? (outcomePriceData.current - outcomePriceData.d7) * 100
          : null;

        if (forecast) {
          // MODEL EDGE: We have forecast data - use model-based signals
          const explainJson = forecast.explainJson as {
            momentumScore?: number;
            accelerationScore?: number;
            confidence?: string;
            historicalPattern?: string;
          } | null;

          const momentumScore = explainJson?.momentumScore ?? 50;
          const accelerationScore = explainJson?.accelerationScore ?? 0;
          const confidence = (explainJson?.confidence as 'low' | 'medium' | 'high') ?? 'low';
          const historicalPattern = explainJson?.historicalPattern ?? 'unknown';

          const modelResult = calculateModelProbability(
            momentumScore,
            accelerationScore,
            { p10: forecast.p10, p50: forecast.p50, p90: forecast.p90 },
            confidence
          );

          const edgeResult = calculateEdge(outcome.probability, modelResult.probability);

          const reasoning = generateReasoning({
            direction: edgeResult.direction,
            edgePercent: edgeResult.edgePercent,
            momentumScore,
            accelerationScore,
            forecastP50: forecast.p50,
            forecastP10: forecast.p10,
            forecastP90: forecast.p90,
            historicalPattern,
            marketProbability: outcome.probability,
          });

          const edgeOpportunity: EdgeOpportunity = {
            marketSlug: market.slug,
            marketLabel: market.label,
            polymarketUrl: market.polymarketUrl,
            category: market.category,
            outcomeName: outcome.name,
            titleId: match.matchedTitleId,
            titleName: match.matchedTitleName,
            signalType: 'model_edge',
            marketProbability: outcome.probability,
            modelProbability: modelResult.probability,
            edge: edgeResult.edge,
            edgePercent: edgeResult.edgePercent,
            signalStrength: edgeResult.signalStrength,
            direction: edgeResult.direction,
            momentumScore,
            accelerationScore,
            forecastP50: forecast.p50,
            forecastP10: forecast.p10,
            forecastP90: forecast.p90,
            confidence,
            historicalPattern,
            reasoning,
            priceChange24h,
            priceChange7d,
            volume24h: outcome.volume,
          };

          edges.push(edgeOpportunity);
        } else {
          // MARKET MOMENTUM: No forecast data - use price trend signals
          const momentumSignal = calculateMomentumSignal(
            priceChange24h,
            priceChange7d,
            outcome.probability
          );

          // Only include if there's meaningful price movement
          if (Math.abs(momentumSignal.score) < 2) continue;

          const reasoning = generateMomentumReasoning({
            direction: momentumSignal.direction,
            priceChange24h,
            priceChange7d,
            marketProbability: outcome.probability,
            volume: outcome.volume,
          });

          const edgeOpportunity: EdgeOpportunity = {
            marketSlug: market.slug,
            marketLabel: market.label,
            polymarketUrl: market.polymarketUrl,
            category: market.category,
            outcomeName: outcome.name,
            titleId: null,
            titleName: null,
            signalType: 'market_momentum',
            marketProbability: outcome.probability,
            modelProbability: outcome.probability, // No model, use market price
            edge: 0,
            edgePercent: momentumSignal.score, // Use momentum score as "edge" for sorting
            signalStrength: momentumSignal.signalStrength,
            direction: momentumSignal.direction,
            momentumScore: 50, // No forecast momentum
            accelerationScore: 0,
            forecastP50: null,
            forecastP10: null,
            forecastP90: null,
            confidence: 'low',
            historicalPattern: 'unknown',
            reasoning,
            priceChange24h,
            priceChange7d,
            volume24h: outcome.volume,
          };

          edges.push(edgeOpportunity);
        }
      }
    }

    // 5. Filter by signal type if specified
    let filteredEdges = edges;
    if (signalTypeFilter === 'model_edge') {
      filteredEdges = edges.filter(e => e.signalType === 'model_edge');
    } else if (signalTypeFilter === 'market_momentum') {
      filteredEdges = edges.filter(e => e.signalType === 'market_momentum');
    }

    // 6. Filter and sort by edge/momentum magnitude
    filteredEdges = filteredEdges
      .filter(e => Math.abs(e.edgePercent) >= minEdge)
      .sort((a, b) => {
        // Prioritize model_edge signals, then sort by magnitude
        if (a.signalType !== b.signalType) {
          return a.signalType === 'model_edge' ? -1 : 1;
        }
        return Math.abs(b.edgePercent) - Math.abs(a.edgePercent);
      })
      .slice(0, limit);

    // Calculate summary stats
    const modelEdges = filteredEdges.filter(e => e.signalType === 'model_edge').length;
    const momentumSignals = filteredEdges.filter(e => e.signalType === 'market_momentum').length;
    const strongSignals = filteredEdges.filter(e => e.signalStrength === 'strong').length;
    const moderateSignals = filteredEdges.filter(e => e.signalStrength === 'moderate').length;
    const buySignals = filteredEdges.filter(e => e.direction === 'BUY').length;
    const avoidSignals = filteredEdges.filter(e => e.direction === 'AVOID').length;
    const avgEdge = filteredEdges.length > 0
      ? filteredEdges.reduce((sum, e) => sum + Math.abs(e.edgePercent), 0) / filteredEdges.length
      : 0;

    return NextResponse.json({
      success: true,
      data: filteredEdges,
      meta: {
        totalEdges: filteredEdges.length,
        modelEdges,
        momentumSignals,
        strongSignals,
        moderateSignals,
        buySignals,
        avoidSignals,
        avgEdge: Math.round(avgEdge * 10) / 10,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error in edge finder:', error);
    return NextResponse.json(
      {
        success: false,
        data: [],
        meta: {
          totalEdges: 0,
          modelEdges: 0,
          momentumSignals: 0,
          strongSignals: 0,
          moderateSignals: 0,
          buySignals: 0,
          avoidSignals: 0,
          avgEdge: 0,
          fetchedAt: new Date().toISOString(),
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
