/**
 * Snapshot Prices Job
 *
 * Hourly cron job to capture Polymarket price snapshots for trend analysis.
 * Stores prices in MarketPriceSnapshot table for historical tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ParsedOutcome {
  name: string;
  probability: number;
  volume: number;
}

interface ParsedMarket {
  slug: string;
  label: string;
  question: string;
  category: string;
  rank: number;
  outcomes: ParsedOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

interface PolymarketApiResponse {
  success: boolean;
  data: ParsedMarket[];
}

interface SnapshotResult {
  snapshotsCreated: number;
  marketsProcessed: number;
  marketsCreated: number;
  errors: string[];
}

async function snapshotActiveMarketPrices(): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    snapshotsCreated: 0,
    marketsProcessed: 0,
    marketsCreated: 0,
    errors: [],
  };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';

  // Fetch all Netflix markets (no category filter = get all)
  const response = await fetch(`${baseUrl}/api/polymarket-netflix`);
  const data: PolymarketApiResponse = await response.json();

  if (!data.success) {
    result.errors.push('Failed to fetch Polymarket data');
    return result;
  }

  const markets = data.data;
  const timestamp = new Date();

  for (const market of markets) {
    try {
      result.marketsProcessed++;

      // Convert outcomes to price map
      const prices: Record<string, number> = {};
      for (const outcome of market.outcomes) {
        prices[outcome.name] = outcome.probability;
      }

      // Find or create market record
      let marketRecord = await prisma.polymarketMarket.findFirst({
        where: { slug: market.slug },
      });

      if (!marketRecord) {
        // Create new market record
        marketRecord = await prisma.polymarketMarket.create({
          data: {
            conditionId: market.slug, // Use slug as conditionId for Netflix markets
            slug: market.slug,
            question: market.question,
            outcomes: market.outcomes,
            category: market.category,
            isActive: true,
          },
        });
        result.marketsCreated++;
      } else {
        // Update market record with latest data
        await prisma.polymarketMarket.update({
          where: { id: marketRecord.id },
          data: {
            question: market.question,
            outcomes: market.outcomes,
            category: market.category,
            isActive: true,
          },
        });
      }

      // Create price snapshot
      await prisma.marketPriceSnapshot.create({
        data: {
          marketId: marketRecord.id,
          timestamp,
          prices,
          volume: market.totalVolume,
        },
      });

      result.snapshotsCreated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to snapshot ${market.slug}: ${message}`);
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret or admin key
    const { searchParams } = request.nextUrl;
    const providedKey = searchParams.get('key');
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_API_KEY;

    // Check authorization header for Vercel Cron
    const authHeader = request.headers.get('authorization');
    const isVercelCron = authHeader === `Bearer ${cronSecret}`;

    // Validate access
    if (!isVercelCron && providedKey !== adminKey && providedKey !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await snapshotActiveMarketPrices();

    // Log job run
    await prisma.jobRun.create({
      data: {
        jobName: 'snapshot-prices',
        status: result.errors.length > 0 ? 'FAIL' : 'SUCCESS',
        detailsJson: result,
      },
    });

    return NextResponse.json({
      success: true,
      result,
      message: `Created ${result.snapshotsCreated} snapshots for ${result.marketsProcessed} markets`,
    });
  } catch (error) {
    console.error('Error in snapshot-prices job:', error);

    // Log failed job run
    try {
      await prisma.jobRun.create({
        data: {
          jobName: 'snapshot-prices',
          status: 'FAIL',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
