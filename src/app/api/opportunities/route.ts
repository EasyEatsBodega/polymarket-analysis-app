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

// Map tab IDs to Netflix category names (database still uses English/Non-English)
// Note: "global" categories return null to include ALL content (English + Non-English)
// because Polymarket Global markets include ALL titles, not just international ones
const categoryMap: Record<string, string | null> = {
  "shows-us": "TV (English)",
  "shows-global": null, // Global = ALL shows (Polymarket Global includes US + international)
  "films-us": "Films (English)",
  "films-global": null, // Global = ALL films (Polymarket Global includes US + international)
};

// For type filtering when category is global
const typeFromCategory: Record<string, TitleType | null> = {
  "shows-us": "SHOW",
  "shows-global": "SHOW",
  "films-us": "MOVIE",
  "films-global": "MOVIE",
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

/**
 * Apply tiered Polymarket adjustment to forecast
 * v1.4.1: This is now done at display time, not at forecast generation
 * This allows the same stored forecast to show different predictions for US vs Global
 */
function applyPolymarketAdjustment(
  baseForecastP50: number,
  marketProbability: number | null
): { adjustedP50: number; adjustedP10: number; adjustedP90: number } {
  if (marketProbability === null) {
    // No market data - use base forecast with default uncertainty
    return {
      adjustedP50: baseForecastP50,
      adjustedP10: Math.max(1, baseForecastP50 - 2),
      adjustedP90: Math.min(10, baseForecastP50 + 2),
    };
  }

  const polyProb = marketProbability * 100; // Convert to percentage
  let adjustedP50 = baseForecastP50;
  let uncertainty = 2; // Default uncertainty

  if (polyProb >= 70) {
    // TIER 1: Clear favorite - override to #1
    adjustedP50 = 1;
    uncertainty = 1;
  } else if (polyProb >= 55) {
    // TIER 2: Strong favorite - heavily weight toward #1-2
    const polyPrediction = 1 + ((100 - polyProb) / 45);
    adjustedP50 = Math.round((baseForecastP50 * 0.3) + (polyPrediction * 0.7));
    uncertainty = 1.5;
  } else if (polyProb >= 40) {
    // TIER 3: Contender - aggressively weight toward Polymarket
    // At 47.5%, this title is essentially a coin flip to be #1
    const polyPrediction = 1 + ((55 - polyProb) / 15); // Range: 1-2 (not 2-3)
    adjustedP50 = Math.round((baseForecastP50 * 0.2) + (polyPrediction * 0.8));
    uncertainty = 1.5;
  } else if (polyProb >= 10) {
    // TIER 4: Lower probability - moderate weight
    const polyPrediction = 3 + ((40 - polyProb) / 10);
    adjustedP50 = Math.round((baseForecastP50 * 0.5) + (polyPrediction * 0.5));
    uncertainty = 2;
  } else {
    // TIER 5: Very low probability (<10%) - penalize
    // If market says <10% chance of #1, push this title DOWN in rankings
    const polyPrediction = 5 + ((10 - polyProb) / 2); // Range: 5-10
    adjustedP50 = Math.round((baseForecastP50 * 0.4) + (polyPrediction * 0.6));
    uncertainty = 3;
  }

  adjustedP50 = Math.max(1, Math.min(10, adjustedP50));

  return {
    adjustedP50,
    adjustedP10: Math.max(1, Math.round(adjustedP50 - uncertainty)),
    adjustedP90: Math.min(10, Math.round(adjustedP50 + uncertainty)),
  };
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
    const polymarketOnly = searchParams.get("polymarketOnly") === "true";
    const sortBy = searchParams.get("sort") || "rank";
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    // Map category param to Netflix category name
    // For "global" categories, netflixCategory is null but we filter by type instead
    const netflixCategory = categoryParam ? categoryMap[categoryParam] : null;
    const categoryType = categoryParam ? typeFromCategory[categoryParam] : null;
    // Use explicit type param if provided, otherwise infer from category
    const effectiveType = type || categoryType;

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
    // For global categories, we filter by type (SHOW/MOVIE) but not by specific category
    const titleWhereClause = effectiveType ? { type: effectiveType } : {};

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

    // 5. Fetch Polymarket data from our own API using the request origin
    // This works reliably in both local and production environments
    const origin = request.nextUrl.origin;
    let polymarketData: { category: string; rank: number; outcomes: Array<{ name: string; probability: number }>; polymarketUrl: string }[] = [];

    try {
      const polyUrl = `${origin}/api/polymarket-netflix`;
      console.log('[opportunities] Fetching Polymarket data from:', polyUrl);
      const polyResponse = await fetch(polyUrl);
      const polyJson = await polyResponse.json();

      if (polyJson.success) {
        // Flatten all categories but keep category info
        const markets = Array.isArray(polyJson.data)
          ? polyJson.data
          : Object.values(polyJson.data).flat();
        polymarketData = markets as typeof polymarketData;
        console.log('[opportunities] Fetched', polymarketData.length, 'markets');
      } else {
        console.error('[opportunities] Polymarket API error:', polyJson);
      }
    } catch (e) {
      console.error('[opportunities] Polymarket fetch error:', e);
    }

    // 5b. Fetch ALL titles from database for market matching
    // (not just titles in the filtered category, since Polymarket markets span categories)
    const allTitles = await withRetry<TitleWithAliases[]>(() =>
      prisma.title.findMany({
        select: { id: true, canonicalName: true, type: true, aliases: true },
      })
    );

    // Build market probability map using ALL titles
    // Filter markets to only those matching the requested category
    const titleCache = buildTitleCache(allTitles);
    const marketDataMap = new Map<
      string,
      { probability: number; polymarketUrl: string }
    >();

    // Only include markets from the requested category AND only #1 markets
    // e.g., "shows-global" should only match against "shows-global" markets
    // We only use rank=1 markets because we're predicting who will be #1
    // The #2 market tells us who will be #2, not #1
    const relevantMarkets = categoryParam
      ? polymarketData.filter(m => m.category === categoryParam && m.rank === 1)
      : polymarketData.filter(m => m.rank === 1);

    console.log('[opportunities] Filtering to category:', categoryParam, 'rank=1 only - relevant markets:', relevantMarkets.length);

    for (const market of relevantMarkets) {
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

      // v1.4.1: Apply Polymarket adjustment dynamically based on current region's market data
      const baseP50 = forecast?.p50 ?? 5;
      const { adjustedP50, adjustedP10, adjustedP90 } = applyPolymarketAdjustment(
        baseP50,
        marketData?.probability ?? null
      );

      if (hasMarket && forecast) {
        marketProbability = marketData.probability;

        const modelResult = calculateModelProbability(
          momentumScore ?? 50,
          accelerationScore,
          { p10: adjustedP10, p50: adjustedP50, p90: adjustedP90 },
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
          forecastP50: adjustedP50,
          forecastP10: adjustedP10,
          forecastP90: adjustedP90,
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
        forecastP50: hasMarket ? adjustedP50 : (forecast?.p50 ?? null),
        forecastP10: hasMarket ? adjustedP10 : (forecast?.p10 ?? null),
        forecastP90: hasMarket ? adjustedP90 : (forecast?.p90 ?? null),
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

      // v1.4.1: Apply Polymarket adjustment dynamically for pre-release titles
      const baseP50 = forecast?.p50 ?? 5;
      const { adjustedP50, adjustedP10, adjustedP90 } = applyPolymarketAdjustment(
        baseP50,
        marketData.probability
      );

      // Calculate edge
      let marketProbability: number | null = marketData.probability;
      let modelProbability: number | null = null;
      let edgePercent: number | null = null;
      let reasoning: string | null = null;

      if (forecast) {
        const modelResult = calculateModelProbability(
          momentumScore ?? 50,
          accelerationScore,
          { p10: adjustedP10, p50: adjustedP50, p90: adjustedP90 },
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
          forecastP50: adjustedP50,
          forecastP10: adjustedP10,
          forecastP90: adjustedP90,
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
        forecastP50: adjustedP50,
        forecastP10: adjustedP10,
        forecastP90: adjustedP90,
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

    // 6c. Filter to Polymarket-only titles if requested
    let filteredOpportunities = opportunities;
    if (polymarketOnly) {
      filteredOpportunities = opportunities.filter(o => o.hasMarket);
      console.log('[opportunities] Filtered to Polymarket-only:', filteredOpportunities.length, 'titles');
    }

    // 7. Deduplicate predicted ranks
    // Multiple titles can have the same forecastP50, but rankings should be unique
    // Use momentum score as tiebreaker, then assign unique ranks
    const deduplicatePredictedRanks = (items: OpportunityResponse[]): OpportunityResponse[] => {
      // Only process items that have forecasts
      const withForecasts = items.filter(o => o.forecastP50 !== null);
      const withoutForecasts = items.filter(o => o.forecastP50 === null);

      if (withForecasts.length === 0) return items;

      // Sort by forecastP50, then by tiebreakers
      const sorted = [...withForecasts].sort((a, b) => {
        // Primary: forecast p50 (lower is better)
        const p50Diff = (a.forecastP50 ?? 99) - (b.forecastP50 ?? 99);
        if (p50Diff !== 0) return p50Diff;

        // Tiebreaker 1: market probability (higher is better = more likely to be #1)
        const marketDiff = (b.marketProbability ?? 0) - (a.marketProbability ?? 0);
        if (marketDiff !== 0) return marketDiff;

        // Tiebreaker 2: momentum score (higher is better, so reverse)
        const momentumDiff = (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
        if (momentumDiff !== 0) return momentumDiff;

        // Tiebreaker 3: model probability (higher is better, so reverse)
        const probDiff = (b.modelProbability ?? 0) - (a.modelProbability ?? 0);
        if (probDiff !== 0) return probDiff;

        // Tiebreaker 4: current rank (lower is better)
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

    const deduplicatedOpportunities = deduplicatePredictedRanks(filteredOpportunities);

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
