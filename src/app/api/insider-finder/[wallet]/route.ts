/**
 * Insider Finder Wallet Detail API
 *
 * Returns detailed information about a specific wallet including
 * all trades, badges, and position breakdowns.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InsiderBadgeType, Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Define Prisma types for properly typed queries
type InsiderTradeResult = Prisma.InsiderTradeGetPayload<{}>;
type InsiderBadgeResult = Prisma.InsiderBadgeGetPayload<{}>;

interface TradeDetail {
  id: string;
  conditionId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketCategory: string | null;
  outcomeName: string;
  side: string;
  size: number;
  price: number;
  usdValue: number;
  timestamp: string;
  transactionHash: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  won: boolean | null;
  pnl: number | null;
  priceAtTrade: number | null;
  price24hLater: number | null;
  daysToResolution: number | null;
  traderRank: number | null;
  badges: Array<{
    type: InsiderBadgeType;
    reason: string;
  }>;
}

interface BadgeDetail {
  id: string;
  type: InsiderBadgeType;
  tradeId: string | null;
  reason: string;
  metadata: Record<string, unknown> | null;
  earnedAt: string;
}

interface PositionSummary {
  conditionId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketCategory: string | null;
  outcomeName: string;
  totalSize: number;
  avgPrice: number;
  totalValue: number;
  resolved: boolean;
  won: boolean | null;
  pnl: number | null;
}

interface WalletDetailResponse {
  success: boolean;
  wallet: {
    id: string;
    address: string;
    proxyWallet: string | null;
    firstTradeAt: string;
    lastTradeAt: string;
    totalTrades: number;
    totalVolume: number;
    winRate: number | null;
    resolvedTrades: number;
    wonTrades: number;
    isTracked: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  badges: BadgeDetail[];
  trades: TradeDetail[];
  activePositions: PositionSummary[];
  resolvedPositions: PositionSummary[];
  stats: {
    totalPnl: number;
    avgTradeSize: number;
    largestTrade: number;
    uniqueMarkets: number;
    categoryCounts: Record<string, number>;
  };
  links: {
    polymarket: string;
    polygonscan: string;
  };
  error?: string;
}

// Badge type to tooltip mapping
export const BADGE_TOOLTIPS: Record<InsiderBadgeType, string> = {
  HIGH_WIN_RATE: 'Won 80%+ of resolved positions',
  BIG_BET: 'This trade was >50% of their total volume',
  LONG_SHOT: 'Bought at <25% probability and was correct',
  PRE_MOVE: 'Price moved 20%+ within 24h of this trade',
  LATE_WINNER: 'Correct bet placed within 7 days of resolution',
  FIRST_MOVER: 'Among first 10 traders on this market',
  FRESH_WALLET: 'Wallet is less than 7 days old',
  SINGLE_MARKET: 'Only traded on one market',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
): Promise<NextResponse<WalletDetailResponse>> {
  try {
    const { wallet: walletParam } = await params;

    // Find wallet by address or ID
    const wallet = await prisma.insiderWallet.findFirst({
      where: {
        OR: [{ address: walletParam }, { id: walletParam }],
      },
    });

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          wallet: null,
          badges: [],
          trades: [],
          activePositions: [],
          resolvedPositions: [],
          stats: {
            totalPnl: 0,
            avgTradeSize: 0,
            largestTrade: 0,
            uniqueMarkets: 0,
            categoryCounts: {},
          },
          links: {
            polymarket: '',
            polygonscan: '',
          },
          error: 'Wallet not found',
        },
        { status: 404 }
      );
    }

    // Fetch all badges for this wallet
    const badges: InsiderBadgeResult[] = await prisma.insiderBadge.findMany({
      where: { walletId: wallet.id },
      orderBy: { earnedAt: 'desc' },
    });

    // Fetch all trades for this wallet
    const trades: InsiderTradeResult[] = await prisma.insiderTrade.findMany({
      where: { walletId: wallet.id },
      orderBy: { timestamp: 'desc' },
    });

    // Map badges by trade ID for easy lookup
    const badgesByTrade = new Map<string, InsiderBadgeResult[]>();
    for (const badge of badges) {
      if (badge.tradeId) {
        if (!badgesByTrade.has(badge.tradeId)) {
          badgesByTrade.set(badge.tradeId, []);
        }
        badgesByTrade.get(badge.tradeId)!.push(badge);
      }
    }

    // Format trades with their badges
    const tradesWithBadges: TradeDetail[] = trades.map((trade) => ({
      id: trade.id,
      conditionId: trade.conditionId,
      marketQuestion: trade.marketQuestion,
      marketSlug: trade.marketSlug,
      marketCategory: trade.marketCategory,
      outcomeName: trade.outcomeName,
      side: trade.side,
      size: trade.size,
      price: trade.price,
      usdValue: trade.usdValue,
      timestamp: trade.timestamp.toISOString(),
      transactionHash: trade.transactionHash,
      resolved: trade.resolved,
      resolvedAt: trade.resolvedAt?.toISOString() || null,
      won: trade.won,
      pnl: trade.pnl,
      priceAtTrade: trade.priceAtTrade,
      price24hLater: trade.price24hLater,
      daysToResolution: trade.daysToResolution,
      traderRank: trade.traderRank,
      badges: (badgesByTrade.get(trade.id) || []).map((b) => ({
        type: b.badgeType,
        reason: b.reason,
      })),
    }));

    // Calculate position summaries
    const positionMap = new Map<string, PositionSummary>();
    for (const trade of trades) {
      const key = `${trade.conditionId}:${trade.outcomeName}`;
      const existing = positionMap.get(key);

      if (existing) {
        const newSize = existing.totalSize + trade.size;
        const newValue = existing.totalValue + trade.usdValue;
        existing.avgPrice = newValue / newSize;
        existing.totalSize = newSize;
        existing.totalValue = newValue;
        if (trade.resolved) {
          existing.resolved = true;
          existing.won = trade.won;
          existing.pnl = (existing.pnl || 0) + (trade.pnl || 0);
        }
      } else {
        positionMap.set(key, {
          conditionId: trade.conditionId,
          marketQuestion: trade.marketQuestion,
          marketSlug: trade.marketSlug,
          marketCategory: trade.marketCategory,
          outcomeName: trade.outcomeName,
          totalSize: trade.size,
          avgPrice: trade.price,
          totalValue: trade.usdValue,
          resolved: trade.resolved,
          won: trade.won,
          pnl: trade.pnl,
        });
      }
    }

    const positions = Array.from(positionMap.values());
    const activePositions = positions.filter((p) => !p.resolved);
    const resolvedPositions = positions.filter((p) => p.resolved);

    // Calculate stats
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgTradeSize =
      trades.length > 0 ? trades.reduce((sum, t) => sum + t.usdValue, 0) / trades.length : 0;
    const largestTrade = Math.max(...trades.map((t) => t.usdValue), 0);
    const uniqueMarkets = new Set(trades.map((t) => t.conditionId)).size;

    const categoryCounts: Record<string, number> = {};
    for (const trade of trades) {
      const category = trade.marketCategory || 'unknown';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    // Format badges
    const formattedBadges: BadgeDetail[] = badges.map((b) => ({
      id: b.id,
      type: b.badgeType,
      tradeId: b.tradeId,
      reason: b.reason,
      metadata: b.metadata as Record<string, unknown> | null,
      earnedAt: b.earnedAt.toISOString(),
    }));

    // External links
    const polymarketUrl = `https://polymarket.com/profile/${wallet.address}`;
    const polygonscanUrl = `https://polygonscan.com/address/${wallet.address}`;

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        proxyWallet: wallet.proxyWallet,
        firstTradeAt: wallet.firstTradeAt.toISOString(),
        lastTradeAt: wallet.lastTradeAt.toISOString(),
        totalTrades: wallet.totalTrades,
        totalVolume: wallet.totalVolume,
        winRate: wallet.winRate,
        resolvedTrades: wallet.resolvedTrades,
        wonTrades: wallet.wonTrades,
        isTracked: wallet.isTracked,
        createdAt: wallet.createdAt.toISOString(),
        updatedAt: wallet.updatedAt.toISOString(),
      },
      badges: formattedBadges,
      trades: tradesWithBadges,
      activePositions,
      resolvedPositions,
      stats: {
        totalPnl,
        avgTradeSize,
        largestTrade,
        uniqueMarkets,
        categoryCounts,
      },
      links: {
        polymarket: polymarketUrl,
        polygonscan: polygonscanUrl,
      },
    });
  } catch (error) {
    console.error('Error in wallet detail:', error);
    return NextResponse.json(
      {
        success: false,
        wallet: null,
        badges: [],
        trades: [],
        activePositions: [],
        resolvedPositions: [],
        stats: {
          totalPnl: 0,
          avgTradeSize: 0,
          largestTrade: 0,
          uniqueMarkets: 0,
          categoryCounts: {},
        },
        links: {
          polymarket: '',
          polygonscan: '',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
