/**
 * Titles List API Endpoint
 *
 * Returns paginated list of titles with optional filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TitleType } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const type = searchParams.get('type') as TitleType | null;
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, parseInt(searchParams.get('pageSize') || '20', 10));

    // Build where clause
    const where: {
      type?: TitleType;
      OR?: Array<{
        canonicalName?: { contains: string; mode: 'insensitive' };
        aliases?: { array_contains: string };
      }>;
    } = {};

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { canonicalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.title.count({ where });

    // Get paginated titles with latest ranking
    const titles = await prisma.title.findMany({
      where,
      include: {
        weeklyGlobal: {
          orderBy: { weekStart: 'desc' },
          take: 1,
        },
        weeklyUS: {
          orderBy: { weekStart: 'desc' },
          take: 1,
        },
        forecasts: {
          orderBy: { weekStart: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Format response
    const formattedTitles = titles.map((title: any) => {
      const latestGlobal = title.weeklyGlobal[0];
      const latestUS = title.weeklyUS[0];
      const latestForecast = title.forecasts[0];
      const explainJson = latestForecast?.explainJson as { momentumScore?: number } | null;

      return {
        id: title.id,
        canonicalName: title.canonicalName,
        type: title.type,
        tmdbId: title.tmdbId,
        latestGlobalRank: latestGlobal?.rank ?? null,
        latestUSRank: latestUS?.rank ?? null,
        latestViews: latestGlobal?.views ?? null,
        momentumScore: explainJson?.momentumScore ?? null,
        lastUpdated: title.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedTitles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching titles:', error);
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
