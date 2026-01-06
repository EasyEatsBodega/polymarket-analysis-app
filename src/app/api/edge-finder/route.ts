/**
 * Edge Finder API
 *
 * Compares model forecasts against Polymarket odds to identify
 * mispriced markets and trading opportunities.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  calculateModelProbability,
  calculateEdge,
  generateReasoning,
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

interface PolymarketApiResponse {
  success: boolean;
  data: ParsedMarket[];
  meta: {
    tab: string;
    count: number;
    fetchedAt: string;
  };
}

export interface EdgeFinderResponse {
  success: boolean;
  data: EdgeOpportunity[];
  meta: {
    totalEdges: number;
    strongSignals: number;
    moderateSignals: number;
    buySignals: number;
    avoidSignals: number;
    avgEdge: number;
    fetchedAt: string;
  };
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<EdgeFinderResponse>> {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const minEdge = parseFloat(searchParams.get('minEdge') || '10');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

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
    const marketsToProcess = polymarketData.data;

    for (const market of marketsToProcess) {
      for (const outcome of market.outcomes) {
        // Skip "Other" outcomes
        if (outcome.name.toLowerCase() === 'other') continue;

        // Match to title
        const match = matchOutcomeToTitle(outcome.name, titleCache);

        // Get forecast data (may not have a match)
        const forecast = match.matchedTitleId
          ? forecastMap.get(match.matchedTitleId)
          : null;

        // IMPORTANT: Only show edges when we have actual forecast data
        // Without real data, we can't make meaningful predictions
        if (!forecast) {
          continue; // Skip titles without forecast data
        }

        // Extract momentum data from forecast explanation
        const explainJson = forecast.explainJson as {
          momentumScore?: number;
          accelerationScore?: number;
          confidence?: string;
          historicalPattern?: string;
        } | null;

        // Use actual forecast data
        const momentumScore = explainJson?.momentumScore ?? 50;
        const accelerationScore = explainJson?.accelerationScore ?? 0;
        const confidence = (explainJson?.confidence as 'low' | 'medium' | 'high') ?? 'low';
        const historicalPattern = explainJson?.historicalPattern ?? 'unknown';

        // Calculate model probability
        const modelResult = calculateModelProbability(
          momentumScore,
          accelerationScore,
          forecast ? { p10: forecast.p10, p50: forecast.p50, p90: forecast.p90 } : null,
          confidence
        );

        // Calculate edge
        const edgeResult = calculateEdge(outcome.probability, modelResult.probability);

        // Generate reasoning for why this is mispriced
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

        // Create edge opportunity
        const edgeOpportunity: EdgeOpportunity = {
          marketSlug: market.slug,
          marketLabel: market.label,
          polymarketUrl: market.polymarketUrl,
          category: market.category,
          outcomeName: outcome.name,
          titleId: match.matchedTitleId,
          titleName: match.matchedTitleName,
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
          priceChange24h: null, // Will be populated from price history later
        };

        edges.push(edgeOpportunity);
      }
    }

    // 5. Filter and sort by edge magnitude
    const filteredEdges = edges
      .filter(e => Math.abs(e.edgePercent) >= minEdge)
      .sort((a, b) => Math.abs(b.edgePercent) - Math.abs(a.edgePercent))
      .slice(0, limit);

    // Calculate summary stats
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
