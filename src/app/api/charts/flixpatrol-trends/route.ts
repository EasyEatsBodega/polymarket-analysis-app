/**
 * FlixPatrol Rank Trends Chart API
 *
 * Returns 14-day daily rank data from FlixPatrol for charting title performance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma, { withRetry } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Prisma types
type MarketTitleLinkSelect = Prisma.MarketTitleLinkGetPayload<{
  select: { titleId: true };
}>;

type FlixPatrolDailyResult = Prisma.FlixPatrolDailyGetPayload<object>;

type TitleSelect = Prisma.TitleGetPayload<{
  select: { id: true; canonicalName: true; type: true };
}>;

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  [titleId: string]: number | string | null;
}

interface TitleInfo {
  id: string;
  name: string;
  type: string;
  color: string;
  currentRank: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const type = searchParams.get('type'); // 'SHOW' or 'MOVIE'
    const region = searchParams.get('region') || 'world'; // 'us' or 'world'
    const days = Math.min(parseInt(searchParams.get('days') || '14', 10), 30);
    const titleId = searchParams.get('titleId'); // Optional: single title mode
    const polymarketOnly = searchParams.get('polymarketOnly') === 'true';

    // Map type to FlixPatrol category
    const category = type === 'MOVIE' ? 'movies' : 'tv';

    // Calculate date range
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Build the query
    let titleIds: string[] = [];

    if (titleId) {
      // Single title mode
      titleIds = [titleId];
    } else if (polymarketOnly) {
      // Get titles that have Polymarket markets
      const marketLinks = await withRetry<MarketTitleLinkSelect[]>(() =>
        prisma.marketTitleLink.findMany({
          select: { titleId: true },
          distinct: ['titleId'],
        })
      );
      titleIds = marketLinks.map(m => m.titleId);
    }

    // Build query - filter by titleIds if specified, otherwise get all entries
    const flixpatrolData = await withRetry<FlixPatrolDailyResult[]>(() =>
      prisma.flixPatrolDaily.findMany({
        where: {
          category,
          region,
          date: {
            gte: startDate,
            lte: endDate,
          },
          // Filter by titleIds only if specified (for single title mode or polymarketOnly)
          ...(titleIds.length > 0 && { titleId: { in: titleIds } }),
        },
        orderBy: { date: 'asc' },
      })
    );

    if (flixpatrolData.length === 0) {
      return NextResponse.json({
        success: true,
        data: { chartData: [], titles: [] },
        meta: { message: 'No FlixPatrol data available for this period' },
      });
    }

    // Get unique dates
    const uniqueDates = [...new Set(flixpatrolData.map(d => d.date.toISOString().split('T')[0]))].sort();

    // Build a map of unique entries using titleId if available, otherwise titleSlug
    // Key: titleId or "slug:titleSlug", Value: { name, type, titleId }
    const titleKeyMap = new Map<string, { name: string; titleId: string | null; slug: string | null }>();
    for (const d of flixpatrolData) {
      const key = d.titleId || `slug:${d.titleSlug}`;
      if (!titleKeyMap.has(key)) {
        titleKeyMap.set(key, {
          name: d.titleName,
          titleId: d.titleId,
          slug: d.titleSlug,
        });
      }
    }
    const uniqueKeys = [...titleKeyMap.keys()];

    // Get title details for entries that have titleId
    const linkedTitleIds = [...titleKeyMap.values()].filter(t => t.titleId).map(t => t.titleId as string);
    const titles = linkedTitleIds.length > 0 ? await withRetry<TitleSelect[]>(() =>
      prisma.title.findMany({
        where: { id: { in: linkedTitleIds } },
        select: { id: true, canonicalName: true, type: true },
      })
    ) : [];
    const titleMap = new Map(titles.map(t => [t.id, t]));

    // Get most recent rank for each entry
    const latestDate = uniqueDates[uniqueDates.length - 1];
    const latestRanks = new Map<string, number>();
    flixpatrolData
      .filter(d => d.date.toISOString().split('T')[0] === latestDate)
      .forEach(d => {
        const key = d.titleId || `slug:${d.titleSlug}`;
        latestRanks.set(key, d.rank);
      });

    // Build chart data
    const chartData: ChartDataPoint[] = uniqueDates.map(dateStr => {
      const dateLabel = new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const dataPoint: ChartDataPoint = {
        date: dateStr,
        dateLabel,
      };

      // Add rank for each title on this date
      uniqueKeys.forEach(key => {
        const record = flixpatrolData.find(d => {
          const recordKey = d.titleId || `slug:${d.titleSlug}`;
          return recordKey === key && d.date.toISOString().split('T')[0] === dateStr;
        });
        dataPoint[key] = record?.rank ?? null;
      });

      return dataPoint;
    });

    // Build titles metadata sorted by current rank
    const titlesInfo: TitleInfo[] = uniqueKeys
      .map((key, index) => {
        const entry = titleKeyMap.get(key)!;
        // Use linked title name if available, otherwise use FlixPatrol name
        const linkedTitle = entry.titleId ? titleMap.get(entry.titleId) : null;
        return {
          id: key,
          name: linkedTitle?.canonicalName || entry.name,
          type: linkedTitle?.type || (category === 'tv' ? 'SHOW' : 'MOVIE'),
          color: getColorForIndex(index),
          currentRank: latestRanks.get(key) || null,
        };
      })
      .sort((a, b) => {
        if (a.currentRank === null) return 1;
        if (b.currentRank === null) return -1;
        return a.currentRank - b.currentRank;
      });

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        titles: titlesInfo,
      },
      meta: {
        days: uniqueDates.length,
        type: type || 'ALL',
        region,
        category,
        titleCount: uniqueTitleIds.length,
      },
    });
  } catch (error) {
    console.error('Error fetching FlixPatrol chart data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
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
