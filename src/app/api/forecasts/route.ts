/**
 * Forecasts API Endpoint
 *
 * Returns forecast data for display and comparison.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, ForecastTarget, TitleType } from '@prisma/client';

const prisma = new PrismaClient();

export interface ForecastResponse {
  id: string;
  titleId: string;
  titleName: string;
  titleType: TitleType;
  weekStart: string;
  weekEnd: string;
  target: ForecastTarget;
  p10: number;
  p50: number;
  p90: number;
  momentumScore: number | null;
  accelerationScore: number | null;
  confidence: string | null;
  historicalPattern: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const target = searchParams.get('target') as ForecastTarget | null;
    const titleType = searchParams.get('type') as TitleType | null;
    const weekStart = searchParams.get('weekStart');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    // Build where clause
    const where: {
      target?: ForecastTarget;
      title?: { type: TitleType };
      weekStart?: Date;
    } = {};

    if (target) {
      where.target = target;
    }

    if (titleType) {
      where.title = { type: titleType };
    }

    if (weekStart) {
      where.weekStart = new Date(weekStart);
    }

    // Get forecasts with title info
    const forecasts = await prisma.forecastWeekly.findMany({
      where,
      include: {
        title: {
          select: {
            id: true,
            canonicalName: true,
            type: true,
          },
        },
      },
      orderBy: { weekStart: 'desc' },
      take: limit,
    });

    // Format response
    const formattedForecasts: ForecastResponse[] = forecasts.map((f) => {
      const explainJson = f.explainJson as {
        momentumScore?: number;
        accelerationScore?: number;
        confidence?: string;
        historicalPattern?: string;
      } | null;

      return {
        id: f.id,
        titleId: f.titleId,
        titleName: f.title.canonicalName,
        titleType: f.title.type,
        weekStart: f.weekStart.toISOString(),
        weekEnd: f.weekEnd.toISOString(),
        target: f.target,
        p10: f.p10,
        p50: f.p50,
        p90: f.p90,
        momentumScore: explainJson?.momentumScore ?? null,
        accelerationScore: explainJson?.accelerationScore ?? null,
        confidence: explainJson?.confidence ?? null,
        historicalPattern: explainJson?.historicalPattern ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedForecasts,
      meta: {
        target: target || 'ALL',
        type: titleType || 'ALL',
        count: formattedForecasts.length,
      },
    });
  } catch (error) {
    console.error('Error fetching forecasts:', error);
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
