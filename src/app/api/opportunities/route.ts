/**
 * Opportunities API
 *
 * Unified endpoint that combines Netflix rankings with Polymarket edge data.
 * Returns opportunity cards with rank forecasts, market odds, and signal classification.
 */

import { NextRequest, NextResponse } from "next/server";
import { TitleType } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  calculateModelProbability,
  calculateEdge,
  generateReasoning,
} from "@/lib/edgeCalculator";
import { matchOutcomeToTitle, buildTitleCache } from "@/lib/marketMatcher";

export const dynamic = "force-dynamic";

type Signal = "BUY" | "HOLD" | "AVOID";
type SignalStrength = "strong" | "moderate" | "weak";

// Map tab IDs to Netflix category names
const categoryMap: Record<string, string> = {
  "shows-english": "TV (English)",
  "shows-non-english": "TV (Non-English)",
  "films-english": "Films (English)",
  "films-non-english": "Films (Non-English)",
};

interface MomentumBreakdown {
  trendsRaw: number | null;
  wikipediaRaw: number | null;
  rankDeltaRaw: number | null;
  trendsNormalized: number | null;
  wikipediaNormalized: number | null;
  rankDeltaNormalized: number | null;
  weights: {
    trendsWeight: number;
    wikipediaWeight: number;
    rankDeltaWeight: number;
  };
  trendsContribution: number;
  wikipediaContribution: number;
  rankDeltaContribution: number;
  totalScore: number;
}

interface OpportunityResponse {
  id: string;
  title: string;
  type: TitleType;
  category: string;

  // Rank data
  currentRank: number | null;
  previousRank: number | null;
  forecastP50: number | null;
  forecastP10: number | null;
  forecastP90: number | null;

  // Market data
  hasMarket: boolean;
  marketProbability: number | null;
  modelProbability: number | null;
  edgePercent: number | null;
  polymarketUrl: string | null;

  // Signal classification
  signal: Signal;
  signalStrength: SignalStrength;
  confidence: "low" | "medium" | "high";

  // Momentum
  momentumScore: number | null;
  momentumBreakdown: MomentumBreakdown | null;
  reasoning: string | null;
}

function classifySignal(
  edgePercent: number | null,
  hasMarket: boolean
): { signal: Signal; strength: SignalStrength } {
  if (!hasMarket || edgePercent === null) {
    return { signal: "HOLD", strength: "weak" };
  }

  const absEdge = Math.abs(edgePercent);

  // Determine strength
  let strength: SignalStrength;
  if (absEdge >= 20) strength = "strong";
  else if (absEdge >= 10) strength = "moderate";
  else strength = "weak";

  // Determine direction
  if (absEdge < 5) {
    return { signal: "HOLD", strength: "weak" };
  }

  return {
    signal: edgePercent > 0 ? "BUY" : "AVOID",
    strength,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const type = searchParams.get("type") as TitleType | null;
    const categoryParam = searchParams.get("category");
    const minEdge = parseFloat(searchParams.get("minEdge") || "0");
    const opportunitiesOnly = searchParams.get("opportunitiesOnly") === "true";
    const sortBy = searchParams.get("sort") || "rank";
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    // Map category param to Netflix category name
    const netflixCategory = categoryParam ? categoryMap[categoryParam] : null;

    // 1. Get the most recent week with data
    const latestWeek = await prisma.netflixWeeklyGlobal.findFirst({
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
      cacheStrategy: { ttl: 300 },
    });

    if (!latestWeek) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { message: "No data available" },
      });
    }

    const weekStart = latestWeek.weekStart;
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    // 2. Fetch current week Netflix rankings
    const titleWhereClause = type ? { type } : {};

    const currentWeekData = await prisma.netflixWeeklyGlobal.findMany({
      where: {
        weekStart,
        title: titleWhereClause,
        ...(netflixCategory && { category: netflixCategory }),
      },
      select: {
        titleId: true,
        rank: true,
        views: true,
        category: true,
      },
      orderBy: { rank: "asc" },
      take: limit * 2,
      cacheStrategy: { ttl: 300 },
    });

    // 3. Get previous week data
    const previousWeekData = await prisma.netflixWeeklyGlobal.findMany({
      where: { weekStart: previousWeekStart },
      select: { titleId: true, rank: true },
      cacheStrategy: { ttl: 300 },
    });
    const previousMap = new Map(previousWeekData.map((p) => [p.titleId, p.rank]));

    // 4. Get title IDs and fetch related data
    const titleIds = currentWeekData.map((d) => d.titleId);

    const [titles, forecasts] = await Promise.all([
      prisma.title.findMany({
        where: { id: { in: titleIds } },
        select: { id: true, canonicalName: true, type: true, aliases: true },
        cacheStrategy: { ttl: 300 },
      }),
      prisma.forecastWeekly.findMany({
        where: {
          titleId: { in: titleIds },
          target: "RANK",
        },
        select: {
          titleId: true,
          p10: true,
          p50: true,
          p90: true,
          explainJson: true,
          weekStart: true,
        },
        orderBy: { weekStart: "desc" },
        cacheStrategy: { ttl: 300 },
      }),
    ]);

    const titleMap = new Map(titles.map((t) => [t.id, t]));

    // Build forecast map (most recent per title)
    const forecastMap = new Map<
      string,
      { p10: number | null; p50: number | null; p90: number | null; explainJson: unknown }
    >();
    for (const f of forecasts) {
      if (!forecastMap.has(f.titleId)) {
        forecastMap.set(f.titleId, f);
      }
    }

    // 5. Fetch Polymarket data - fetch ALL markets (not filtered by category)
    // because Polymarket's "Global" markets include titles from all Netflix language categories
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let polymarketData: { outcomes: Array<{ name: string; probability: number }>; polymarketUrl: string }[] = [];

    try {
      // Fetch all markets without category filter
      const polyUrl = `${baseUrl}/api/polymarket-netflix`;
      const polyResponse = await fetch(polyUrl, { next: { revalidate: 60 } });
      const polyJson = await polyResponse.json();

      if (polyJson.success) {
        // Flatten all categories
        const markets = Array.isArray(polyJson.data)
          ? polyJson.data
          : Object.values(polyJson.data).flat();
        polymarketData = markets as typeof polymarketData;
      }
    } catch {
      // Polymarket fetch failed - continue without market data
    }

    // 5b. Fetch ALL titles from database for market matching
    // (not just titles in the filtered category, since Polymarket markets span categories)
    const allTitles = await prisma.title.findMany({
      select: { id: true, canonicalName: true, type: true, aliases: true },
      cacheStrategy: { ttl: 300 },
    });

    // Build market probability map using ALL titles
    const titleCache = buildTitleCache(allTitles);
    const marketDataMap = new Map<
      string,
      { probability: number; polymarketUrl: string }
    >();

    for (const market of polymarketData) {
      for (const outcome of market.outcomes || []) {
        if (outcome.name.toLowerCase() === "other") continue;
        const match = matchOutcomeToTitle(outcome.name, titleCache);
        if (match.matchedTitleId) {
          marketDataMap.set(match.matchedTitleId, {
            probability: outcome.probability,
            polymarketUrl: market.polymarketUrl,
          });
        }
      }
    }

    // 6. Build opportunity responses
    const opportunities: OpportunityResponse[] = [];

    for (const weekData of currentWeekData) {
      const title = titleMap.get(weekData.titleId);
      if (!title) continue;

      const forecast = forecastMap.get(weekData.titleId);
      const marketData = marketDataMap.get(weekData.titleId);
      const previousRank = previousMap.get(weekData.titleId) ?? null;

      // Extract forecast explanation
      const explainJson = forecast?.explainJson as {
        momentumScore?: number;
        accelerationScore?: number;
        confidence?: string;
        momentumBreakdown?: MomentumBreakdown;
      } | null;

      const momentumScore = explainJson?.momentumScore ?? null;
      const accelerationScore = explainJson?.accelerationScore ?? 0;
      const confidence = (explainJson?.confidence as "low" | "medium" | "high") ?? "low";
      const momentumBreakdown = explainJson?.momentumBreakdown ?? null;

      // Calculate edge if we have market and forecast data
      let marketProbability: number | null = null;
      let modelProbability: number | null = null;
      let edgePercent: number | null = null;
      let reasoning: string | null = null;
      const hasMarket = !!marketData;

      if (hasMarket && forecast) {
        marketProbability = marketData.probability;

        const modelResult = calculateModelProbability(
          momentumScore ?? 50,
          accelerationScore,
          { p10: forecast.p10 ?? 5, p50: forecast.p50 ?? 5, p90: forecast.p90 ?? 5 },
          confidence
        );
        modelProbability = modelResult.probability;

        const edgeResult = calculateEdge(marketProbability, modelProbability);
        edgePercent = edgeResult.edgePercent;

        reasoning = generateReasoning({
          direction: edgeResult.direction,
          edgePercent: edgeResult.edgePercent,
          momentumScore: momentumScore ?? 50,
          accelerationScore,
          forecastP50: forecast.p50 ?? 5,
          forecastP10: forecast.p10 ?? 5,
          forecastP90: forecast.p90 ?? 5,
          historicalPattern: "unknown",
          marketProbability,
        });
      }

      // Classify signal
      const { signal, strength } = classifySignal(edgePercent, hasMarket);

      // Filter by min edge if opportunitiesOnly
      if (opportunitiesOnly && (edgePercent === null || Math.abs(edgePercent) < minEdge)) {
        continue;
      }

      opportunities.push({
        id: weekData.titleId,
        title: title.canonicalName,
        type: title.type,
        category: weekData.category,
        currentRank: weekData.rank,
        previousRank,
        forecastP50: forecast?.p50 ?? null,
        forecastP10: forecast?.p10 ?? null,
        forecastP90: forecast?.p90 ?? null,
        hasMarket,
        marketProbability,
        modelProbability,
        edgePercent,
        polymarketUrl: marketData?.polymarketUrl ?? null,
        signal,
        signalStrength: strength,
        confidence,
        momentumScore,
        momentumBreakdown,
        reasoning,
      });
    }

    // 7. Sort results
    opportunities.sort((a, b) => {
      switch (sortBy) {
        case "edge":
          return Math.abs(b.edgePercent ?? 0) - Math.abs(a.edgePercent ?? 0);
        case "momentum":
          return (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
        case "rank":
        default:
          return (a.currentRank ?? 999) - (b.currentRank ?? 999);
      }
    });

    // Apply limit
    const limitedResults = opportunities.slice(0, limit);

    // Calculate meta stats
    const buyCount = limitedResults.filter((o) => o.signal === "BUY").length;
    const avoidCount = limitedResults.filter((o) => o.signal === "AVOID").length;

    return NextResponse.json({
      success: true,
      data: limitedResults,
      meta: {
        weekStart: weekStart.toISOString(),
        total: limitedResults.length,
        buySignals: buyCount,
        avoidSignals: avoidCount,
        titlesWithMarkets: limitedResults.filter((o) => o.hasMarket).length,
      },
    });
  } catch (error) {
    console.error("Error in opportunities API:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
