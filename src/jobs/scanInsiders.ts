/**
 * Insider Detection Job
 *
 * Scans Polymarket trades to identify potential insider trading patterns.
 * Looks for new wallets with minimal trades and suspicious signals.
 *
 * Criteria:
 * - New wallet (first trade within configurable timeframe)
 * - Less than 5 trades total
 * - Minimum trade size: >$500
 * - All markets EXCEPT Crypto & Sports
 */

import prisma from '@/lib/prisma';
import {
  scanForNewWallets,
  ProcessedTrade,
  getMarketResolution,
  getMarketPrices,
} from '@/lib/polymarketClient';
import { InsiderBadgeType } from '@prisma/client';

interface ScanResult {
  walletsScanned: number;
  walletsQualified: number;
  walletsCreated: number;
  walletsUpdated: number;
  tradesRecorded: number;
  badgesAwarded: number;
  errors: string[];
}

interface BadgeCandidate {
  type: InsiderBadgeType;
  tradeId?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calculate badges for a wallet based on their trades
 */
function calculateBadges(
  wallet: {
    totalTrades: number;
    totalVolume: number;
    winRate: number | null;
    resolvedTrades: number;
  },
  trades: Array<{
    id: string;
    usdValue: number;
    price: number;
    won: boolean | null;
    priceAtTrade: number | null;
    price24hLater: number | null;
    daysToResolution: number | null;
    traderRank: number | null;
  }>
): BadgeCandidate[] {
  const badges: BadgeCandidate[] = [];

  // HIGH_WIN_RATE: 80%+ win rate with at least 2 resolved trades
  if (wallet.winRate !== null && wallet.winRate >= 0.8 && wallet.resolvedTrades >= 2) {
    badges.push({
      type: 'HIGH_WIN_RATE',
      reason: `Won ${Math.round(wallet.winRate * 100)}% of ${wallet.resolvedTrades} resolved positions`,
      metadata: { winRate: wallet.winRate, resolvedTrades: wallet.resolvedTrades },
    });
  }

  // Per-trade badges
  for (const trade of trades) {
    // BIG_BET: Trade > 50% of total volume
    if (trade.usdValue > 0.5 * wallet.totalVolume) {
      badges.push({
        type: 'BIG_BET',
        tradeId: trade.id,
        reason: `Trade was ${Math.round((trade.usdValue / wallet.totalVolume) * 100)}% of total volume`,
        metadata: { tradeValue: trade.usdValue, totalVolume: wallet.totalVolume },
      });
    }

    // LONG_SHOT: Bought at <25% probability and won
    if (trade.price < 0.25 && trade.won === true) {
      badges.push({
        type: 'LONG_SHOT',
        tradeId: trade.id,
        reason: `Bought at ${Math.round(trade.price * 100)}% probability and was correct`,
        metadata: { entryPrice: trade.price },
      });
    }

    // PRE_MOVE: Price moved 20%+ within 24h
    if (
      trade.priceAtTrade !== null &&
      trade.price24hLater !== null &&
      Math.abs(trade.price24hLater - trade.priceAtTrade) >= 0.2
    ) {
      const priceMove = trade.price24hLater - trade.priceAtTrade;
      badges.push({
        type: 'PRE_MOVE',
        tradeId: trade.id,
        reason: `Price moved ${priceMove > 0 ? '+' : ''}${Math.round(priceMove * 100)}% within 24 hours`,
        metadata: { priceAtTrade: trade.priceAtTrade, price24hLater: trade.price24hLater },
      });
    }

    // LATE_WINNER: Correct bet within 7 days of resolution
    if (trade.daysToResolution !== null && trade.daysToResolution <= 7 && trade.won === true) {
      badges.push({
        type: 'LATE_WINNER',
        tradeId: trade.id,
        reason: `Won bet placed ${trade.daysToResolution} day${trade.daysToResolution === 1 ? '' : 's'} before resolution`,
        metadata: { daysToResolution: trade.daysToResolution },
      });
    }

    // FIRST_MOVER: Among first 10 traders
    if (trade.traderRank !== null && trade.traderRank <= 10) {
      badges.push({
        type: 'FIRST_MOVER',
        tradeId: trade.id,
        reason: `Was trader #${trade.traderRank} on this market`,
        metadata: { traderRank: trade.traderRank },
      });
    }
  }

  return badges;
}

/**
 * Check and update resolution status for trades
 */
async function updateTradeResolutions(walletId: string): Promise<void> {
  // Get unresolved trades
  const unresolvedTrades = await prisma.insiderTrade.findMany({
    where: {
      walletId,
      resolved: false,
    },
  });

  for (const trade of unresolvedTrades) {
    try {
      const resolution = await getMarketResolution(trade.conditionId);
      if (!resolution || !resolution.resolved) continue;

      // Determine if the trade won
      const won = trade.outcomeName === resolution.winner;
      const pnl = won ? trade.size * (1 - trade.price) : -trade.size * trade.price;

      // Calculate days to resolution
      const resolvedAt = new Date();
      const daysToResolution = Math.floor(
        (resolvedAt.getTime() - trade.timestamp.getTime()) / (1000 * 60 * 60 * 24)
      );

      await prisma.insiderTrade.update({
        where: { id: trade.id },
        data: {
          resolved: true,
          resolvedAt,
          won,
          pnl,
          daysToResolution,
        },
      });
    } catch (error) {
      console.warn(`Failed to update resolution for trade ${trade.id}:`, error);
    }
  }
}

/**
 * Update wallet statistics
 */
async function updateWalletStats(walletId: string): Promise<void> {
  const trades = await prisma.insiderTrade.findMany({
    where: { walletId },
  });

  const resolvedTrades = trades.filter((t) => t.resolved);
  const wonTrades = resolvedTrades.filter((t) => t.won === true);

  const totalTrades = trades.length;
  const totalVolume = trades.reduce((sum, t) => sum + t.usdValue, 0);
  const winRate = resolvedTrades.length > 0 ? wonTrades.length / resolvedTrades.length : null;

  const timestamps = trades.map((t) => t.timestamp.getTime());
  const firstTradeAt = new Date(Math.min(...timestamps));
  const lastTradeAt = new Date(Math.max(...timestamps));

  await prisma.insiderWallet.update({
    where: { id: walletId },
    data: {
      totalTrades,
      totalVolume,
      winRate,
      resolvedTrades: resolvedTrades.length,
      wonTrades: wonTrades.length,
      firstTradeAt,
      lastTradeAt,
    },
  });
}

/**
 * Award badges to a wallet
 */
async function awardBadges(walletId: string, result: ScanResult): Promise<void> {
  // Get wallet and trades
  const wallet = await prisma.insiderWallet.findUnique({
    where: { id: walletId },
    include: { trades: true },
  });

  if (!wallet) return;

  // Calculate badges
  const badges = calculateBadges(
    {
      totalTrades: wallet.totalTrades,
      totalVolume: wallet.totalVolume,
      winRate: wallet.winRate,
      resolvedTrades: wallet.resolvedTrades,
    },
    wallet.trades.map((t) => ({
      id: t.id,
      usdValue: t.usdValue,
      price: t.price,
      won: t.won,
      priceAtTrade: t.priceAtTrade,
      price24hLater: t.price24hLater,
      daysToResolution: t.daysToResolution,
      traderRank: t.traderRank,
    }))
  );

  // Upsert badges
  for (const badge of badges) {
    try {
      await prisma.insiderBadge.upsert({
        where: {
          walletId_tradeId_badgeType: {
            walletId,
            tradeId: badge.tradeId || '',
            badgeType: badge.type,
          },
        },
        create: {
          walletId,
          tradeId: badge.tradeId || null,
          badgeType: badge.type,
          reason: badge.reason,
          metadata: badge.metadata,
        },
        update: {
          reason: badge.reason,
          metadata: badge.metadata,
        },
      });
      result.badgesAwarded++;
    } catch (error) {
      // Handle case where tradeId is null (different unique constraint)
      if (badge.tradeId === undefined) {
        const existing = await prisma.insiderBadge.findFirst({
          where: {
            walletId,
            tradeId: null,
            badgeType: badge.type,
          },
        });

        if (!existing) {
          await prisma.insiderBadge.create({
            data: {
              walletId,
              tradeId: null,
              badgeType: badge.type,
              reason: badge.reason,
              metadata: badge.metadata,
            },
          });
          result.badgesAwarded++;
        }
      }
    }
  }
}

/**
 * Process a single wallet and its trades
 */
async function processWallet(
  address: string,
  trades: ProcessedTrade[],
  result: ScanResult
): Promise<void> {
  try {
    // Upsert wallet
    const existingWallet = await prisma.insiderWallet.findUnique({
      where: { address },
    });

    const timestamps = trades.map((t) => t.timestamp.getTime());
    const firstTradeAt = new Date(Math.min(...timestamps));
    const lastTradeAt = new Date(Math.max(...timestamps));
    const totalVolume = trades.reduce((sum, t) => sum + t.usdValue, 0);

    let wallet;
    if (existingWallet) {
      wallet = await prisma.insiderWallet.update({
        where: { id: existingWallet.id },
        data: {
          lastTradeAt,
          totalTrades: trades.length,
          totalVolume,
        },
      });
      result.walletsUpdated++;
    } else {
      wallet = await prisma.insiderWallet.create({
        data: {
          address,
          firstTradeAt,
          lastTradeAt,
          totalTrades: trades.length,
          totalVolume,
        },
      });
      result.walletsCreated++;
    }

    // Upsert trades
    for (const trade of trades) {
      try {
        await prisma.insiderTrade.upsert({
          where: {
            walletId_conditionId_transactionHash: {
              walletId: wallet.id,
              conditionId: trade.conditionId,
              transactionHash: trade.transactionHash || '',
            },
          },
          create: {
            walletId: wallet.id,
            conditionId: trade.conditionId,
            marketQuestion: trade.marketQuestion,
            marketSlug: trade.marketSlug,
            marketCategory: trade.marketCategory,
            outcomeName: trade.outcomeName,
            side: trade.side,
            size: trade.size,
            price: trade.price,
            usdValue: trade.usdValue,
            timestamp: trade.timestamp,
            transactionHash: trade.transactionHash,
            priceAtTrade: trade.price,
            resolved: trade.marketResolved,
          },
          update: {
            marketQuestion: trade.marketQuestion,
            marketSlug: trade.marketSlug,
            marketCategory: trade.marketCategory,
          },
        });
        result.tradesRecorded++;
      } catch (error) {
        result.errors.push(`Error recording trade for ${address}: ${error}`);
      }
    }

    // Update resolutions and stats
    await updateTradeResolutions(wallet.id);
    await updateWalletStats(wallet.id);
    await awardBadges(wallet.id, result);

    result.walletsQualified++;
  } catch (error) {
    result.errors.push(`Error processing wallet ${address}: ${error}`);
  }
}

/**
 * Main scan function
 */
export async function scanInsiders(options: {
  daysBack?: number;
  minTradeSize?: number;
  maxTrades?: number;
} = {}): Promise<ScanResult> {
  const { daysBack = 30, minTradeSize = 500, maxTrades = 5 } = options;

  const result: ScanResult = {
    walletsScanned: 0,
    walletsQualified: 0,
    walletsCreated: 0,
    walletsUpdated: 0,
    tradesRecorded: 0,
    badgesAwarded: 0,
    errors: [],
  };

  try {
    console.log(`Scanning for insider wallets (last ${daysBack} days)...`);

    // Scan Polymarket for new wallets
    const walletTrades = await scanForNewWallets({
      daysBack,
      minTradeSize,
      maxTrades,
    });

    result.walletsScanned = walletTrades.size;
    console.log(`Found ${walletTrades.size} wallets to process`);

    // Process each wallet
    let processed = 0;
    for (const [address, trades] of walletTrades) {
      await processWallet(address, trades, result);
      processed++;

      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${walletTrades.size} wallets`);
      }
    }

    // Also update existing tracked wallets
    const existingWallets = await prisma.insiderWallet.findMany({
      where: { isTracked: true },
      select: { id: true },
    });

    for (const wallet of existingWallets) {
      await updateTradeResolutions(wallet.id);
      await updateWalletStats(wallet.id);
      await awardBadges(wallet.id, result);
    }

    console.log(`Scan complete: ${result.walletsQualified} qualifying wallets`);
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : error}`);
  }

  return result;
}

/**
 * Run job with logging
 */
export async function runInsiderScanJob(options: {
  daysBack?: number;
  minTradeSize?: number;
  maxTrades?: number;
} = {}): Promise<void> {
  const startTime = Date.now();

  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'scan_insiders',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting insider scan...');
    const result = await scanInsiders(options);

    const duration = Date.now() - startTime;
    console.log(`Insider scan complete in ${duration}ms`);
    console.log(`Wallets scanned: ${result.walletsScanned}`);
    console.log(`Wallets qualified: ${result.walletsQualified}`);
    console.log(`Wallets created: ${result.walletsCreated}, updated: ${result.walletsUpdated}`);
    console.log(`Trades recorded: ${result.tradesRecorded}`);
    console.log(`Badges awarded: ${result.badgesAwarded}`);

    if (result.errors.length > 0) {
      console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 10));
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Insider scan failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        detailsJson: { durationMs: duration },
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly
if (require.main === module) {
  const daysBack = parseInt(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] || '30');
  runInsiderScanJob({ daysBack })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
