/**
 * Watchlist API
 *
 * Manages pinned titles for tracking upcoming Netflix releases.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/watchlist
 * Returns all pinned titles with their latest pacing metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    // Fetch pinned titles
    const pinnedTitles = await prisma.pinnedTitle.findMany({
      take: limit,
      orderBy: { pinnedAt: 'desc' },
    });

    if (pinnedTitles.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { count: 0 },
      });
    }

    const titleIds = pinnedTitles.map((p) => p.titleId);

    // Fetch titles
    const titles = await prisma.title.findMany({
      where: { id: { in: titleIds } },
      select: { id: true, canonicalName: true, type: true },
    });
    const titleMap = new Map(titles.map((t) => [t.id, t]));

    // Fetch pacing metrics (last 7 days for each title)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const pacingMetrics = await prisma.pacingMetricDaily.findMany({
      where: {
        titleId: { in: titleIds },
        date: { gte: sevenDaysAgo },
      },
      orderBy: { date: 'desc' },
    });

    // Group metrics by titleId
    const metricsMap = new Map<string, typeof pacingMetrics>();
    for (const metric of pacingMetrics) {
      if (!metricsMap.has(metric.titleId)) {
        metricsMap.set(metric.titleId, []);
      }
      metricsMap.get(metric.titleId)!.push(metric);
    }

    // Fetch release candidates
    const releaseCandidates = await prisma.releaseCandidate.findMany({
      where: {
        titleId: { in: titleIds },
        status: { in: ['PENDING', 'MATCHED'] },
      },
    });
    const candidateMap = new Map(releaseCandidates.map((c) => [c.titleId!, c]));

    // Transform data for frontend
    const watchlist = pinnedTitles.map((pinned) => {
      const title = titleMap.get(pinned.titleId);
      const metrics = metricsMap.get(pinned.titleId) || [];
      const latestMetric = metrics[0];
      const releaseCandidate = candidateMap.get(pinned.titleId);

      // Calculate 7-day trend (latest - oldest) / oldest * 100
      let trendPercent = null;
      if (metrics.length >= 2) {
        const oldest = metrics[metrics.length - 1]?.pacingScore;
        const newest = latestMetric?.pacingScore;
        if (oldest && newest && oldest > 0) {
          trendPercent = ((newest - oldest) / oldest) * 100;
        }
      }

      return {
        id: pinned.id,
        titleId: pinned.titleId,
        pinnedAt: pinned.pinnedAt,
        pinnedBy: pinned.pinnedBy,
        title: title ? {
          id: title.id,
          name: title.canonicalName,
          type: title.type,
        } : null,
        releaseDate: releaseCandidate?.releaseDate?.toISOString() || null,
        pacing: {
          current: latestMetric?.pacingScore || null,
          trendsUS: latestMetric?.trendsUS || null,
          trendsGlobal: latestMetric?.trendsGlobal || null,
          wikiViews: latestMetric?.wikiViews || null,
          trendPercent,
          sparkline: metrics.map((m) => ({
            date: m.date.toISOString().split('T')[0],
            score: m.pacingScore,
          })).reverse(), // Oldest to newest for charting
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: watchlist,
      meta: {
        count: watchlist.length,
      },
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
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

/**
 * POST /api/watchlist
 * Add a title to the watchlist
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titleId, pinnedBy } = body;

    if (!titleId) {
      return NextResponse.json(
        { success: false, error: 'titleId is required' },
        { status: 400 }
      );
    }

    // Check if title exists
    const title = await prisma.title.findUnique({
      where: { id: titleId },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title not found' },
        { status: 404 }
      );
    }

    // Check if already pinned
    const existing = await prisma.pinnedTitle.findUnique({
      where: { titleId },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Title is already in watchlist' },
        { status: 409 }
      );
    }

    // Create pinned title
    const pinned = await prisma.pinnedTitle.create({
      data: {
        titleId,
        pinnedBy: pinnedBy || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: pinned.id,
        titleId: pinned.titleId,
        pinnedAt: pinned.pinnedAt,
        title: {
          id: title.id,
          name: title.canonicalName,
          type: title.type,
        },
      },
    });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
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
