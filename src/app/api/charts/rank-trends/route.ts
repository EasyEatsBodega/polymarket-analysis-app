/**
 * Rank Trends Chart API
 *
 * Returns historical rank data for charting title performance over time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TitleType } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface ChartDataPoint {
  week: string;
  weekLabel: string;
  [titleId: string]: number | string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const type = searchParams.get('type') as TitleType | null;
    const language = searchParams.get('language'); // 'english' or 'non-english'
    const weeks = Math.min(parseInt(searchParams.get('weeks') || '8', 10), 52);
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 10);

    // Map language filter to Netflix category
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

    // Get the most recent weeks (cached for 5 minutes)
    const recentWeeks = await prisma.netflixWeeklyGlobal.findMany({
      where: categoryFilter ? { category: categoryFilter } : {},
      select: { weekStart: true },
      distinct: ['weekStart'],
      orderBy: { weekStart: 'desc' },
      take: weeks,
      cacheStrategy: { ttl: 300 },
    });

    if (recentWeeks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { chartData: [], titles: [] },
        meta: { message: 'No data available' },
      });
    }

    const weekStarts = recentWeeks.map(w => w.weekStart).reverse(); // Oldest to newest
    const latestWeek = weekStarts[weekStarts.length - 1];

    // Get top titles from the latest week (cached)
    const topRankings = await prisma.netflixWeeklyGlobal.findMany({
      where: {
        weekStart: latestWeek,
        ...(categoryFilter && { category: categoryFilter }),
      },
      orderBy: { rank: 'asc' },
      take: limit,
      cacheStrategy: { ttl: 300 },
    });

    const titleIds = topRankings.map(t => t.titleId);

    // Fetch title details and historical data in parallel (cached)
    const [titlesData, historicalData] = await Promise.all([
      prisma.title.findMany({
        where: { id: { in: titleIds } },
        select: { id: true, canonicalName: true, type: true },
        cacheStrategy: { ttl: 300 },
      }),
      prisma.netflixWeeklyGlobal.findMany({
        where: {
          titleId: { in: titleIds },
          weekStart: { in: weekStarts },
          ...(categoryFilter && { category: categoryFilter }),
        },
        orderBy: { weekStart: 'asc' },
        cacheStrategy: { ttl: 300 },
      }),
    ]);
    const titleMap = new Map(titlesData.map(t => [t.id, t]));

    // Build chart data structure
    const chartData: ChartDataPoint[] = weekStarts.map(weekStart => {
      const weekStr = weekStart.toISOString().split('T')[0];
      const weekLabel = new Date(weekStart).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      const dataPoint: ChartDataPoint = {
        week: weekStr,
        weekLabel,
      };

      // Add rank for each title
      titleIds.forEach(titleId => {
        const record = historicalData.find(
          h => h.titleId === titleId && h.weekStart.getTime() === weekStart.getTime()
        );
        dataPoint[titleId] = record?.rank ?? null;
      });

      return dataPoint;
    });

    // Build titles metadata
    const titles = titleIds.map((id, index) => ({
      id,
      name: titleMap.get(id)?.canonicalName || 'Unknown',
      type: titleMap.get(id)?.type || 'SHOW',
      color: getColorForIndex(index),
      currentRank: topRankings.find(t => t.titleId === id)?.rank || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        titles,
      },
      meta: {
        weeks: weekStarts.length,
        type: type || 'ALL',
        language: language || 'ALL',
      },
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
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

function getColorForIndex(index: number): string {
  const colors = [
    '#E50914', // Netflix Red
    '#FFD700', // Gold
    '#00A8E1', // Blue
    '#46D369', // Green
    '#9B59B6', // Purple
    '#E67E22', // Orange
    '#1ABC9C', // Teal
    '#E91E63', // Pink
    '#3498DB', // Light Blue
    '#2ECC71', // Emerald
  ];
  return colors[index % colors.length];
}
