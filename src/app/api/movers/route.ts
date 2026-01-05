/**
 * Top Movers API Endpoint
 *
 * Returns titles with highest momentum scores.
 * Used by the dashboard to display trending content.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TitleType } from '@prisma/client';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';


export interface MoverResponse {
  id: string;
  title: string;
  type: TitleType;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  views: number | null;
  momentumScore: number;
  forecastP10: number | null;
  forecastP50: number | null;
  forecastP90: number | null;
  category: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const type = searchParams.get('type') as TitleType | null;
    const geo = searchParams.get('geo') || 'GLOBAL'; // GLOBAL or US
    const language = searchParams.get('language'); // 'english' or 'non-english' (optional)
    const sortBy = searchParams.get('sort') || 'rank'; // 'rank', 'change', 'views', 'momentum'
    const sortOrder = searchParams.get('order') || 'asc'; // 'asc' or 'desc'
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    // Map language filter to Netflix category patterns
    const getCategoryFilter = () => {
      if (!language) return undefined;
      if (language === 'english') {
        return type === 'SHOW' ? 'TV (English)' : 'Films (English)';
      }
      if (language === 'non-english') {
        return type === 'SHOW' ? 'TV (Non-English)' : 'Films (Non-English)';
      }
      return undefined;
    };
    const categoryFilter = getCategoryFilter();

    // Get the most recent week with data (cache for 5 minutes)
    const latestWeek = await prisma.netflixWeeklyGlobal.findFirst({
      orderBy: { weekStart: 'desc' },
      select: { weekStart: true },
      cacheStrategy: { ttl: 300 },
    });

    if (!latestWeek) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { message: 'No data available' },
      });
    }

    const weekStart = latestWeek.weekStart;
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    // Get current week data with forecasts
    const whereClause = type ? { type } : {};

    // Fetch current week data and titles separately to avoid complex nested queries
    const currentWeekData =
      geo === 'US'
        ? await prisma.netflixWeeklyUS.findMany({
            where: {
              weekStart,
              title: whereClause,
              ...(categoryFilter && { category: categoryFilter }),
            },
            select: {
              titleId: true,
              rank: true,
              category: true,
            },
            orderBy: { rank: 'asc' },
            take: limit * 2,
            cacheStrategy: { ttl: 300 },
          })
        : await prisma.netflixWeeklyGlobal.findMany({
            where: {
              weekStart,
              title: whereClause,
              ...(categoryFilter && { category: categoryFilter }),
            },
            select: {
              titleId: true,
              rank: true,
              views: true,
              category: true,
            },
            orderBy: { rank: 'asc' },
            take: limit * 2,
            cacheStrategy: { ttl: 300 },
          });

    // Get title IDs for batch fetch
    const titleIds = currentWeekData.map((d) => d.titleId);

    // Batch fetch titles and forecasts
    const [titles, forecasts] = await Promise.all([
      prisma.title.findMany({
        where: { id: { in: titleIds } },
        select: { id: true, canonicalName: true, type: true },
        cacheStrategy: { ttl: 300 },
      }),
      prisma.forecastWeekly.findMany({
        where: {
          titleId: { in: titleIds },
          weekStart,
          target: geo === 'US' ? 'RANK' : 'VIEWERSHIP',
        },
        select: { titleId: true, p10: true, p50: true, p90: true, explainJson: true },
        cacheStrategy: { ttl: 300 },
      }),
    ]);

    const titleMap = new Map(titles.map((t: { id: string; canonicalName: string; type: TitleType }) => [t.id, t]));
    const forecastMap = new Map(forecasts.map((f: { titleId: string; p10: number | null; p50: number | null; p90: number | null; explainJson: unknown }) => [f.titleId, f]));

    // Combine data
    const currentData = currentWeekData.map((d) => ({
      ...d,
      title: titleMap.get(d.titleId),
      forecast: forecastMap.get(d.titleId),
    }));

    // Get previous week data for comparison (cached)
    const previousData =
      geo === 'US'
        ? await prisma.netflixWeeklyUS.findMany({
            where: {
              weekStart: previousWeekStart,
              ...(categoryFilter && { category: categoryFilter }),
            },
            select: { titleId: true, rank: true },
            cacheStrategy: { ttl: 300 },
          })
        : await prisma.netflixWeeklyGlobal.findMany({
            where: {
              weekStart: previousWeekStart,
              ...(categoryFilter && { category: categoryFilter }),
            },
            select: { titleId: true, rank: true, views: true },
            cacheStrategy: { ttl: 300 },
          });

    const previousMap = new Map(previousData.map((p) => [p.titleId, p]));

    // Build response with momentum calculation
    const movers: MoverResponse[] = currentData
      .filter((current) => current.title) // Filter out entries without title
      .map((current) => {
        const previous = previousMap.get(current.titleId);
        const currentRank = current.rank;
        const previousRank = previous?.rank ?? null;
        const rankChange = previousRank ? previousRank - currentRank : null;

        // Get forecast data from the separate fetch
        const forecast = current.forecast;
        const explainJson = forecast?.explainJson as { momentumScore?: number } | null;

        // Calculate momentum score from forecast or estimate from rank change
        const momentumScore = explainJson?.momentumScore ?? (rankChange ? 50 + rankChange * 5 : 50);

        return {
          id: current.title!.id,
          title: current.title!.canonicalName,
          type: current.title!.type,
          currentRank,
          previousRank,
          rankChange,
          views: 'views' in current && current.views ? Number(current.views) : null,
          momentumScore,
          forecastP10: forecast?.p10 ?? null,
          forecastP50: forecast?.p50 ?? null,
          forecastP90: forecast?.p90 ?? null,
          category: current.category,
        };
      });

    // Sort based on parameter
    const sortedMovers = movers.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'rank':
          comparison = (a.currentRank ?? 999) - (b.currentRank ?? 999);
          break;
        case 'change':
          comparison = (b.rankChange ?? -999) - (a.rankChange ?? -999); // Higher change first by default
          break;
        case 'views':
          comparison = (b.views ?? 0) - (a.views ?? 0); // Higher views first by default
          break;
        case 'momentum':
          comparison = b.momentumScore - a.momentumScore; // Higher momentum first by default
          break;
        default:
          comparison = (a.currentRank ?? 999) - (b.currentRank ?? 999);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    }).slice(0, limit);

    return NextResponse.json({
      success: true,
      data: sortedMovers,
      meta: {
        weekStart: weekStart.toISOString(),
        geo,
        type: type || 'ALL',
        count: sortedMovers.length,
      },
    });
  } catch (error) {
    console.error('Error fetching movers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
