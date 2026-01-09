/**
 * Title Details API Endpoint
 *
 * Returns detailed information about a specific title including:
 * - Historical rankings
 * - Signal data
 * - Forecasts
 * - Linked Polymarket markets
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get title with all related data
    const title: any = await prisma.title.findUnique({
      where: { id },
      include: {
        weeklyGlobal: {
          orderBy: { weekStart: 'desc' },
          take: 12, // Last 12 weeks
        },
        weeklyUS: {
          orderBy: { weekStart: 'desc' },
          take: 12,
        },
        dailySignals: {
          orderBy: { date: 'desc' },
          take: 30, // Last 30 days
        },
        forecasts: {
          orderBy: { weekStart: 'desc' },
          take: 4, // Last 4 forecasts
        },
        marketLinks: {
          include: {
            market: {
              include: {
                prices: {
                  orderBy: { timestamp: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        // FlixPatrol trailer data - last 10 snapshots per trailer
        flixPatrolTrailers: {
          orderBy: { fetchedAt: 'desc' },
          take: 50, // Get enough to show history for multiple trailers
        },
        // FlixPatrol social data - last 10 snapshots per platform
        flixPatrolSocial: {
          orderBy: { fetchedAt: 'desc' },
          take: 40, // Get enough to show history for multiple platforms
        },
      },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title not found' },
        { status: 404 }
      );
    }

    // Calculate rank trends
    const globalRanks = title.weeklyGlobal.map((w: any) => ({
      week: w.weekStart.toISOString(),
      rank: w.rank,
      views: w.views ? Number(w.views) : null,
      category: w.category,
    }));

    const usRanks = title.weeklyUS.map((w: any) => ({
      week: w.weekStart.toISOString(),
      rank: w.rank,
      category: w.category,
    }));

    // Organize signals by source
    const trendsSignals = title.dailySignals
      .filter((s: any) => s.source === 'TRENDS')
      .map((s: any) => ({
        date: s.date.toISOString(),
        value: s.value,
      }));

    const wikipediaSignals = title.dailySignals
      .filter((s: any) => s.source === 'WIKIPEDIA')
      .map((s: any) => ({
        date: s.date.toISOString(),
        value: s.value,
      }));

    // Format forecasts
    const forecasts = title.forecasts.map((f: any) => {
      const explain = f.explainJson as {
        momentumScore?: number;
        accelerationScore?: number;
        confidence?: string;
        historicalPattern?: string;
      } | null;

      return {
        weekStart: f.weekStart.toISOString(),
        weekEnd: f.weekEnd.toISOString(),
        target: f.target,
        p10: f.p10,
        p50: f.p50,
        p90: f.p90,
        modelVersion: f.modelVersion,
        momentumScore: explain?.momentumScore,
        accelerationScore: explain?.accelerationScore,
        confidence: explain?.confidence,
        historicalPattern: explain?.historicalPattern,
      };
    });

    // Format market links
    const markets = title.marketLinks.map((link: any) => ({
      id: link.market.id,
      conditionId: link.market.conditionId,
      slug: link.market.slug,
      question: link.market.question,
      outcomes: link.market.outcomes,
      endDate: link.market.endDate?.toISOString(),
      resolved: link.market.resolved,
      latestPrices: link.market.prices[0]?.prices ?? null,
      lastUpdated: link.market.prices[0]?.timestamp.toISOString() ?? null,
    }));

    // Format FlixPatrol trailer data - group by trailer ID and get history
    const trailerMap = new Map<string, any[]>();
    for (const t of title.flixPatrolTrailers || []) {
      const key = t.fpTrailerId;
      if (!trailerMap.has(key)) {
        trailerMap.set(key, []);
      }
      trailerMap.get(key)!.push(t);
    }

    const trailers = Array.from(trailerMap.entries()).map(([fpTrailerId, records]) => {
      // Sort by fetchedAt ascending for history
      const sorted = records.sort((a: any, b: any) =>
        new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

      // Calculate changes
      const viewsChange = previous ? latest.views - previous.views : 0;
      const likesChange = previous ? latest.likes - previous.likes : 0;

      return {
        fpTrailerId,
        title: latest.trailerTitle,
        premiereDate: latest.premiereDate?.toISOString() ?? null,
        current: {
          views: latest.views,
          likes: latest.likes,
          dislikes: latest.dislikes,
          engagementRatio: latest.engagementRatio,
        },
        changes: {
          views: viewsChange,
          likes: likesChange,
        },
        history: sorted.map((r: any) => ({
          date: r.fetchedAt.toISOString(),
          views: r.views,
          likes: r.likes,
          dislikes: r.dislikes,
          engagementRatio: r.engagementRatio,
        })),
      };
    });

    // Format FlixPatrol social data - group by platform and get history
    const socialMap = new Map<string, any[]>();
    for (const s of title.flixPatrolSocial || []) {
      const key = s.platform;
      if (!socialMap.has(key)) {
        socialMap.set(key, []);
      }
      socialMap.get(key)!.push(s);
    }

    const social = Array.from(socialMap.entries()).map(([platform, records]) => {
      // Sort by fetchedAt ascending for history
      const sorted = records.sort((a: any, b: any) =>
        new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

      // Calculate growth
      const followersChange = previous ? latest.followers - previous.followers : latest.change;
      const growthPercent = previous && previous.followers > 0
        ? ((latest.followers - previous.followers) / previous.followers) * 100
        : 0;

      return {
        platform,
        current: {
          followers: latest.followers,
          change: latest.change,
        },
        growthPercent,
        followersChange,
        history: sorted.map((r: any) => ({
          date: r.fetchedAt.toISOString(),
          followers: r.followers,
          change: r.change,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: title.id,
        canonicalName: title.canonicalName,
        type: title.type,
        tmdbId: title.tmdbId,
        aliases: title.aliases,
        rankings: {
          global: globalRanks,
          us: usRanks,
        },
        signals: {
          trends: trendsSignals,
          wikipedia: wikipediaSignals,
        },
        forecasts,
        markets,
        flixpatrol: {
          trailers,
          social,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching title:', error);
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
