/**
 * Opportunities API
 *
 * Unified endpoint that combines Netflix rankings with Polymarket edge data.
 * Returns opportunity cards with rank forecasts, market odds, and signal classification.
 */

import { NextRequest, NextResponse } from "next/server";
import { TitleType, Prisma } from "@prisma/client";
import prisma, { withRetry } from "@/lib/prisma";
import {
  calculateModelProbability,
  calculateEdge,
  generateReasoning,
} from "@/lib/edgeCalculator";
import { matchOutcomeToTitle, buildTitleCache } from "@/lib/marketMatcher";

export const dynamic = "force-dynamic";

// Define Prisma types for properly typed queries
type WeeklyGlobalWithWeekStart = Prisma.NetflixWeeklyGlobalGetPayload<{
  select: { weekStart: true };
}>;

type WeeklyGlobalWithSelect = {
  titleId: string;
  rank: number;
  views: bigint | null;
  category: string;
};

type PreviousWeekData = {
  titleId: string;
  rank: number;
};

type TitleWithAliases = Prisma.TitleGetPayload<{
  select: { id: true; canonicalName: true; type: true; aliases: true };
}>;

type TitleBasic = Prisma.TitleGetPayload<{
  select: { id: true; canonicalName: true; type: true };
}>;

type ForecastBasic = {
  titleId: string;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  explainJson: Prisma.JsonValue | null;
  weekStart: Date;
};

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
    const latestWeek = await withRetry<WeeklyGlobalWithWeekStart | null>(() =>
      prisma.netflixWeeklyGlobal.findFirst({
        orderBy: { weekStart: "desc" },
        select: { weekStart: true },
      })
    );

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

    const currentWeekData = await withRetry<WeeklyGlobalWithSelect[]>(() =>
      prisma.netflixWeeklyGlobal.findMany({
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
      })
    );

    // 3. Get previous week data
    const previousWeekData = await withRetry<PreviousWeekData[]>(() =>
      prisma.netflixWeeklyGlobal.findMany({
        where: { weekStart: previousWeekStart },
        select: { titleId: true, rank: true },
      })
    );
    const previousMap = new Map(previousWeekData.map((p: PreviousWeekData) => [p.titleId, p.rank]));

    // 4. Get title IDs and fetch related data
    const titleIds = currentWeekData.map((d) => d.titleId);

    // Guard against empty arrays (Prisma can throw "null pointer" errors with empty IN clauses)
    const [titles, forecasts]: [TitleWithAliases[], ForecastBasic[]] = titleIds.length > 0
      ? await withRetry<[TitleWithAliases[], ForecastBasic[]]>(() =>
          Promise.all([
            prisma.title.findMany({
              where: { id: { in: titleIds } },
              select: { id: true, canonicalName: true, type: true, aliases: true },
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
            }),
          ])
        )
      : [[], []];

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
    const allTitles = await withRetry<TitleWithAliases[]>(() =>
      prisma.title.findMany({
        select: { id: true, canonicalName: true, type: true, aliases: true },
      })
    );

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
          const existing = marketDataMap.get(match.matchedTitleId);
          const isResolvedProb = outcome.probability >= 0.99 || outcome.probability <= 0.01;
          const existingIsResolved = existing && (existing.probability >= 0.99 || existing.probability <= 0.01);

          // Prefer non-resolved probabilities (between 1% and 99%)
          // This ensures active/unresolved markets take priority over closed/resolved ones
          if (!existing || (existingIsResolved && !isResolvedProb)) {
            marketDataMap.set(match.matchedTitleId, {
              probability: outcome.probability,
              polymarketUrl: market.polymarketUrl,
            });
          }
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

    // 6b. Add pre-release Polymarket titles (not in current Netflix rankings)
    // These are titles with polymarket markets but no current Netflix data
    const existingTitleIds = new Set(opportunities.map(o => o.id));

    // Get all titles with polymarket external IDs, then filter in JS to avoid Prisma notIn issues
    const allPolymarketTitles = await withRetry<TitleBasic[]>(() =>
      prisma.title.findMany({
        where: {
          externalIds: { some: { provider: 'polymarket' } },
        },
        select: { id: true, canonicalName: true, type: true },
      })
    );

    // Filter out titles that are already in opportunities (JS filter instead of SQL notIn)
    const preReleaseTitles = allPolymarketTitles.filter(t => !existingTitleIds.has(t.id));

    // Get forecasts for pre-release titles
    const preReleaseTitleIds = preReleaseTitles.map(t => t.id);
    const preReleaseForecasts: ForecastBasic[] = preReleaseTitleIds.length > 0
      ? await withRetry<ForecastBasic[]>(() =>
          prisma.forecastWeekly.findMany({
            where: {
              titleId: { in: preReleaseTitleIds },
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
          })
        )
      : [];

    // Build forecast map for pre-release titles
    const preReleaseForecastMap = new Map<
      string,
      { p10: number | null; p50: number | null; p90: number | null; explainJson: unknown }
    >();
    for (const f of preReleaseForecasts) {
      if (!preReleaseForecastMap.has(f.titleId)) {
        preReleaseForecastMap.set(f.titleId, f);
      }
    }

    for (const title of preReleaseTitles) {
      const marketData = marketDataMap.get(title.id);
      const forecast = preReleaseForecastMap.get(title.id);

      // Skip if no market data (we only want titles actively trading on Polymarket)
      if (!marketData) continue;

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

      // Calculate edge
      let marketProbability: number | null = marketData.probability;
      let modelProbability: number | null = null;
      let edgePercent: number | null = null;
      let reasoning: string | null = null;

      if (forecast) {
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
          historicalPattern: "pre_release",
          marketProbability,
        });
      }

      const { signal, strength } = classifySignal(edgePercent, true);

      // Filter by min edge if opportunitiesOnly
      if (opportunitiesOnly && (edgePercent === null || Math.abs(edgePercent) < minEdge)) {
        continue;
      }

      // Determine category based on title type
      const preReleaseCategory = title.type === 'MOVIE'
        ? 'Films (English)'
        : 'TV (English)';

      // Skip if category filter doesn't match
      if (netflixCategory && preReleaseCategory !== netflixCategory) {
        continue;
      }

      opportunities.push({
        id: title.id,
        title: title.canonicalName,
        type: title.type,
        category: preReleaseCategory,
        currentRank: null, // Pre-release - no current rank
        previousRank: null,
        forecastP50: forecast?.p50 ?? null,
        forecastP10: forecast?.p10 ?? null,
        forecastP90: forecast?.p90 ?? null,
        hasMarket: true,
        marketProbability,
        modelProbability,
        edgePercent,
        polymarketUrl: marketData.polymarketUrl,
        signal,
        signalStrength: strength,
        confidence,
        momentumScore,
        momentumBreakdown,
        reasoning,
      });
    }

    console.log('[opportunities] Added pre-release titles:', preReleaseTitles.filter(t => marketDataMap.has(t.id)).map(t => t.canonicalName));

    // 7. Deduplicate predicted ranks
    // Multiple titles can have the same forecastP50, but rankings should be unique
    // Use momentum score as tiebreaker, then assign unique ranks
    const deduplicatePredictedRanks = (items: OpportunityResponse[]): OpportunityResponse[] => {
      // Only process items that have forecasts
      const withForecasts = items.filter(o => o.forecastP50 !== null);
      const withoutForecasts = items.filter(o => o.forecastP50 === null);

      if (withForecasts.length === 0) return items;

      // Sort by forecastP50, then by tiebreakers (higher momentum = better/lower rank)
      const sorted = [...withForecasts].sort((a, b) => {
        // Primary: forecast p50 (lower is better)
        const p50Diff = (a.forecastP50 ?? 99) - (b.forecastP50 ?? 99);
        if (p50Diff !== 0) return p50Diff;

        // Tiebreaker 1: momentum score (higher is better, so reverse)
        const momentumDiff = (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
        if (momentumDiff !== 0) return momentumDiff;

        // Tiebreaker 2: model probability (higher is better, so reverse)
        const probDiff = (b.modelProbability ?? 0) - (a.modelProbability ?? 0);
        if (probDiff !== 0) return probDiff;

        // Tiebreaker 3: current rank (lower is better)
        return (a.currentRank ?? 99) - (b.currentRank ?? 99);
      });

      // Assign unique predicted ranks (1, 2, 3, ...) by creating new objects
      const deduped = sorted.map((item, index) => {
        const newP50 = index + 1;
        const oldP50 = item.forecastP50 ?? newP50;
        const offset = newP50 - oldP50;

        return {
          ...item,
          forecastP50: newP50,
          forecastP10: item.forecastP10 !== null ? Math.max(1, item.forecastP10 + offset) : null,
          forecastP90: item.forecastP90 !== null ? Math.min(10, item.forecastP90 + offset) : null,
        };
      });

      return [...deduped, ...withoutForecasts];
    };

    const deduplicatedOpportunities = deduplicatePredictedRanks(opportunities);

    console.log('[opportunities] Deduplicated ranks:', deduplicatedOpportunities.map(o => ({ title: o.title.substring(0, 20), p50: o.forecastP50 })));

    // 8. Sort results
    deduplicatedOpportunities.sort((a, b) => {
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
    const limitedResults = deduplicatedOpportunities.slice(0, limit);

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
