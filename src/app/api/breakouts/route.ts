/**
 * Breakouts API Endpoint
 *
 * Returns titles with high momentum AND positive acceleration.
 * These are potential breakout candidates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TitleType } from '@prisma/client';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';


export interface BreakoutResponse {
  id: string;
  title: string;
  type: TitleType;
  momentumScore: number;
  accelerationScore: number;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  weeksOnChart: number;
  historicalPattern: string;
}

async function getBreakoutThreshold(): Promise<number> {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { key: 'breakoutThreshold' },
    });

    if (config?.value && typeof config.value === 'object' && 'value' in config.value) {
      return (config.value as { value: number }).value;
    }
  } catch {
    // Fall back to default
  }

  return 60; // Default threshold
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const type = searchParams.get('type') as TitleType | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    // Get breakout threshold
    const threshold = await getBreakoutThreshold();

    // Get the most recent week with data
    const latestWeek = await prisma.netflixWeeklyGlobal.findFirst({
      orderBy: { weekStart: 'desc' },
      select: { weekStart: true },
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

    // Get forecasts with high momentum for this week
    const whereClause = type ? { title: { type } } : {};

    const forecasts = await prisma.forecastWeekly.findMany({
      where: {
        weekStart,
        ...whereClause,
      },
      include: {
        title: {
          include: {
            weeklyGlobal: {
              where: { weekStart },
              take: 1,
            },
          },
        },
      },
    });

    // Filter for breakouts (high momentum + positive acceleration)
    const breakouts: BreakoutResponse[] = [];

    for (const forecast of forecasts) {
      const explainJson = forecast.explainJson as {
        momentumScore?: number;
        accelerationScore?: number;
        historicalPattern?: string;
      } | null;

      const momentumScore = explainJson?.momentumScore ?? 0;
      const accelerationScore = explainJson?.accelerationScore ?? 0;

      // Must meet threshold AND have positive acceleration
      if (momentumScore >= threshold && accelerationScore > 0) {
        const currentData = forecast.title.weeklyGlobal[0];

        // Get previous week rank
        const previousData = await prisma.netflixWeeklyGlobal.findFirst({
          where: {
            titleId: forecast.titleId,
            weekStart: previousWeekStart,
          },
          select: { rank: true },
        });

        // Count weeks on chart
        const weeksCount = await prisma.netflixWeeklyGlobal.count({
          where: { titleId: forecast.titleId },
        });

        breakouts.push({
          id: forecast.title.id,
          title: forecast.title.canonicalName,
          type: forecast.title.type,
          momentumScore,
          accelerationScore,
          currentRank: currentData?.rank ?? null,
          previousRank: previousData?.rank ?? null,
          rankChange: previousData?.rank && currentData?.rank
            ? previousData.rank - currentData.rank
            : null,
          weeksOnChart: weeksCount,
          historicalPattern: explainJson?.historicalPattern ?? 'unknown',
        });
      }
    }

    // Sort by acceleration (fastest rising first)
    const sortedBreakouts = breakouts
      .sort((a, b) => b.accelerationScore - a.accelerationScore)
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: sortedBreakouts,
      meta: {
        weekStart: weekStart.toISOString(),
        threshold,
        type: type || 'ALL',
        count: sortedBreakouts.length,
      },
    });
  } catch (error) {
    console.error('Error fetching breakouts:', error);
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
