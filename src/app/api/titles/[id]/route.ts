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
