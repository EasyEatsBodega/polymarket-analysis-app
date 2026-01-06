/**
 * Insider Finder List API
 *
 * Returns paginated list of suspected insider wallets with filtering options.
 *
 * Query params:
 * - timeframe: 7|30|60|90 (days, default 30)
 * - badges: comma-separated badge types
 * - categories: comma-separated market categories
 * - minSize: minimum position size
 * - maxSize: maximum position size
 * - page: page number (default 1)
 * - limit: items per page (default 25)
 * - sort: field to sort by (default: firstTradeAt)
 * - order: asc|desc (default: desc)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InsiderBadgeType, Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface InsiderWalletResponse {
  id: string;
  address: string;
  firstTradeAt: string;
  lastTradeAt: string;
  totalTrades: number;
  totalVolume: number;
  winRate: number | null;
  resolvedTrades: number;
  wonTrades: number;
  badges: Array<{
    type: InsiderBadgeType;
    reason: string;
    earnedAt: string;
  }>;
  recentTrades: Array<{
    id: string;
    marketQuestion: string;
    marketSlug: string | null;
    marketCategory: string | null;
    outcomeName: string;
    side: string;
    price: number;
    usdValue: number;
    timestamp: string;
    won: boolean | null;
  }>;
}

interface InsiderFinderListResponse {
  success: boolean;
  data: InsiderWalletResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    filters: {
      timeframe: number;
      badges: string[];
      categories: string[];
      minSize: number | null;
      maxSize: number | null;
    };
  };
  error?: string;
}

// Valid badge types
const VALID_BADGE_TYPES: InsiderBadgeType[] = [
  'HIGH_WIN_RATE',
  'BIG_BET',
  'LONG_SHOT',
  'PRE_MOVE',
  'LATE_WINNER',
  'FIRST_MOVER',
];

export async function GET(
  request: NextRequest
): Promise<NextResponse<InsiderFinderListResponse>> {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query params
    const timeframe = parseInt(searchParams.get('timeframe') || '30');
    const badgesParam = searchParams.get('badges');
    const categoriesParam = searchParams.get('categories');
    const minSize = searchParams.get('minSize')
      ? parseFloat(searchParams.get('minSize')!)
      : null;
    const maxSize = searchParams.get('maxSize')
      ? parseFloat(searchParams.get('maxSize')!)
      : null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '25')));
    const sort = searchParams.get('sort') || 'firstTradeAt';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    // Parse badge filter
    const badges = badgesParam
      ? badgesParam
          .split(',')
          .map((b) => b.trim().toUpperCase())
          .filter((b) => VALID_BADGE_TYPES.includes(b as InsiderBadgeType))
      : [];

    // Parse category filter
    const categories = categoriesParam
      ? categoriesParam.split(',').map((c) => c.trim().toLowerCase())
      : [];

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframe);

    // Build where clause
    const where: Prisma.InsiderWalletWhereInput = {
      isTracked: true,
      firstTradeAt: { gte: startDate },
    };

    // Filter by badges if specified
    if (badges.length > 0) {
      where.badges = {
        some: {
          badgeType: { in: badges as InsiderBadgeType[] },
        },
      };
    }

    // Filter by categories (requires joining with trades)
    if (categories.length > 0) {
      where.trades = {
        some: {
          marketCategory: { in: categories },
        },
      };
    }

    // Filter by volume range
    if (minSize !== null || maxSize !== null) {
      where.totalVolume = {};
      if (minSize !== null) where.totalVolume.gte = minSize;
      if (maxSize !== null) where.totalVolume.lte = maxSize;
    }

    // Get total count
    const total = await prisma.insiderWallet.count({ where });

    // Build orderBy
    const orderBy: Prisma.InsiderWalletOrderByWithRelationInput = {};
    if (sort === 'totalVolume') {
      orderBy.totalVolume = order;
    } else if (sort === 'totalTrades') {
      orderBy.totalTrades = order;
    } else if (sort === 'winRate') {
      orderBy.winRate = order;
    } else {
      orderBy.firstTradeAt = order;
    }

    // Fetch wallets with relations
    const wallets = await prisma.insiderWallet.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        badges: {
          orderBy: { earnedAt: 'desc' },
        },
        trades: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
    }) as unknown as Array<
      Prisma.InsiderWalletGetPayload<{
        include: { badges: true; trades: true };
      }>
    >;

    // Format response
    const data: InsiderWalletResponse[] = wallets.map((wallet) => ({
      id: wallet.id,
      address: wallet.address,
      firstTradeAt: wallet.firstTradeAt.toISOString(),
      lastTradeAt: wallet.lastTradeAt.toISOString(),
      totalTrades: wallet.totalTrades,
      totalVolume: wallet.totalVolume,
      winRate: wallet.winRate,
      resolvedTrades: wallet.resolvedTrades,
      wonTrades: wallet.wonTrades,
      badges: wallet.badges.map((b) => ({
        type: b.badgeType,
        reason: b.reason,
        earnedAt: b.earnedAt.toISOString(),
      })),
      recentTrades: wallet.trades.map((t) => ({
        id: t.id,
        marketQuestion: t.marketQuestion,
        marketSlug: t.marketSlug,
        marketCategory: t.marketCategory,
        outcomeName: t.outcomeName,
        side: t.side,
        price: t.price,
        usdValue: t.usdValue,
        timestamp: t.timestamp.toISOString(),
        won: t.won,
      })),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        filters: {
          timeframe,
          badges,
          categories,
          minSize,
          maxSize,
        },
      },
    });
  } catch (error) {
    console.error('Error in insider finder list:', error);
    return NextResponse.json(
      {
        success: false,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
          filters: {
            timeframe: 30,
            badges: [],
            categories: [],
            minSize: null,
            maxSize: null,
          },
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
