/**
 * Pacing Metrics API
 *
 * Returns historical pacing data for a specific title.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Define Prisma types for properly typed queries
type PacingMetricResult = Prisma.PacingMetricDailyGetPayload<{}>;

interface RouteParams {
  params: Promise<{ titleId: string }>;
}

/**
 * GET /api/pacing/[titleId]
 * Returns pacing metrics for a title
 *
 * Query params:
 * - days: number of days to return (default: 14, max: 90)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { titleId } = await params;
    const { searchParams } = request.nextUrl;
    const days = Math.min(parseInt(searchParams.get('days') || '14', 10), 90);

    // Verify title exists
    const title = await prisma.title.findUnique({
      where: { id: titleId },
      select: { id: true, canonicalName: true, type: true },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title not found' },
        { status: 404 }
      );
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Fetch pacing metrics
    const metrics: PacingMetricResult[] = await prisma.pacingMetricDaily.findMany({
      where: {
        titleId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Calculate summary stats
    const scores = metrics.map((m) => m.pacingScore).filter((s): s is number => s !== null);
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
    const maxScore = scores.length > 0 ? Math.max(...scores) : null;
    const minScore = scores.length > 0 ? Math.min(...scores) : null;

    // Calculate trend (last 7 days vs previous 7 days)
    let trendPercent = null;
    if (metrics.length >= 14) {
      const recent = metrics.slice(-7);
      const previous = metrics.slice(-14, -7);

      const recentAvg = recent
        .map((m) => m.pacingScore)
        .filter((s): s is number => s !== null)
        .reduce((a, b, _, arr) => a + b / arr.length, 0);

      const previousAvg = previous
        .map((m) => m.pacingScore)
        .filter((s): s is number => s !== null)
        .reduce((a, b, _, arr) => a + b / arr.length, 0);

      if (previousAvg > 0) {
        trendPercent = ((recentAvg - previousAvg) / previousAvg) * 100;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        title: {
          id: title.id,
          name: title.canonicalName,
          type: title.type,
        },
        metrics: metrics.map((m) => ({
          date: m.date.toISOString().split('T')[0],
          trendsUS: m.trendsUS,
          trendsGlobal: m.trendsGlobal,
          wikiViews: m.wikiViews,
          pacingScore: m.pacingScore,
        })),
        summary: {
          days,
          dataPoints: metrics.length,
          avgScore,
          maxScore,
          minScore,
          trendPercent,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching pacing metrics:', error);
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
