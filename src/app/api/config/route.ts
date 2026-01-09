/**
 * App Configuration API Endpoint
 *
 * Allows reading and updating app configuration.
 * Protected endpoint - requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];

export const dynamic = 'force-dynamic';


// Default configuration values
const DEFAULT_CONFIG = {
  momentumWeights: {
    trendsWeight: 0.33,
    wikipediaWeight: 0.33,
    rankDeltaWeight: 0.34,
  },
  breakoutThreshold: { value: 60 },
};

export async function GET() {
  try {
    // Get all config values
    const configs = await prisma.appConfig.findMany();

    // Build config object with defaults
    const configMap: Record<string, unknown> = { ...DEFAULT_CONFIG };

    for (const config of configs) {
      configMap[config.key] = config.value;
    }

    return NextResponse.json({
      success: true,
      data: configMap,
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch config' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Verify admin access
    const { userId } = await auth();
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { key, value } = body as {
      key: string;
      value: unknown;
    };

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing key or value' },
        { status: 400 }
      );
    }

    // Validate the key
    const validKeys = ['momentumWeights', 'breakoutThreshold'];
    if (!validKeys.includes(key)) {
      return NextResponse.json(
        { success: false, error: `Invalid config key: ${key}` },
        { status: 400 }
      );
    }

    // Validate value structure based on key
    if (key === 'momentumWeights') {
      const weights = value as { trendsWeight?: number; wikipediaWeight?: number; rankDeltaWeight?: number };
      if (
        typeof weights.trendsWeight !== 'number' ||
        typeof weights.wikipediaWeight !== 'number' ||
        typeof weights.rankDeltaWeight !== 'number'
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid momentum weights format' },
          { status: 400 }
        );
      }

      // Ensure weights sum to ~1
      const sum = weights.trendsWeight + weights.wikipediaWeight + weights.rankDeltaWeight;
      if (Math.abs(sum - 1) > 0.01) {
        return NextResponse.json(
          { success: false, error: 'Momentum weights must sum to 1' },
          { status: 400 }
        );
      }
    }

    if (key === 'breakoutThreshold') {
      const threshold = value as { value?: number };
      if (typeof threshold.value !== 'number' || threshold.value < 0 || threshold.value > 100) {
        return NextResponse.json(
          { success: false, error: 'Breakout threshold must be a number between 0 and 100' },
          { status: 400 }
        );
      }
    }

    // Upsert the config
    const config = await prisma.appConfig.upsert({
      where: { key },
      create: {
        key,
        value: value as object,
        updatedBy: userId,  // Use authenticated user ID
      },
      update: {
        value: value as object,
        updatedBy: userId,  // Use authenticated user ID
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        key: config.key,
        value: config.value,
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update config' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
