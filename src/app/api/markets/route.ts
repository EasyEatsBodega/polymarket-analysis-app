/**
 * Polymarket Markets API Endpoint
 *
 * Returns tracked Polymarket markets with latest prices.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface MarketResponse {
  id: string;
  conditionId: string;
  slug: string | null;
  question: string;
  description: string | null;
  outcomes: Array<{ id: string; name: string; price?: number }>;
  category: string | null;
  endDate: string | null;
  resolved: boolean;
  isActive: boolean;
  latestPrices: Record<string, number> | null;
  volume: number | null;
  liquidity: number | null;
  lastUpdated: string | null;
  linkedTitles: Array<{ id: string; name: string }>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const active = searchParams.get('active') !== 'false';
    const withTitles = searchParams.get('withTitles') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    // Get markets with latest prices
    const markets = await prisma.polymarketMarket.findMany({
      where: active ? { isActive: true } : undefined,
      include: {
        prices: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        titleLinks: withTitles
          ? {
              include: {
                title: {
                  select: { id: true, canonicalName: true },
                },
              },
            }
          : false,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const formattedMarkets: MarketResponse[] = markets.map((market) => {
      const latestPrice = market.prices[0];

      return {
        id: market.id,
        conditionId: market.conditionId,
        slug: market.slug,
        question: market.question,
        description: market.description,
        outcomes: market.outcomes as Array<{ id: string; name: string; price?: number }>,
        category: market.category,
        endDate: market.endDate?.toISOString() ?? null,
        resolved: market.resolved,
        isActive: market.isActive,
        latestPrices: latestPrice?.prices as Record<string, number> | null,
        volume: latestPrice?.volume ?? null,
        liquidity: latestPrice?.liquidity ?? null,
        lastUpdated: latestPrice?.timestamp.toISOString() ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkedTitles: Array.isArray(market.titleLinks)
          ? (market.titleLinks as any[]).map((link) => ({
              id: link.title?.id ?? '',
              name: link.title?.canonicalName ?? '',
            }))
          : [],
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedMarkets,
      meta: {
        count: formattedMarkets.length,
        activeOnly: active,
      },
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
