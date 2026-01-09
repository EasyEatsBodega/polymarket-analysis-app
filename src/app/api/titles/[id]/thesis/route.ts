/**
 * Title Market Thesis API Endpoint
 *
 * Returns market thesis explaining WHY prediction markets price a title
 * at a certain probability, including:
 * - Notable cast members
 * - Star power score
 * - Source material
 * - Genre appeal
 * - Pre-release buzz signals
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateMarketThesis } from '@/lib/marketThesis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get title with signals data
    const title = await prisma.title.findUnique({
      where: { id },
      select: {
        id: true,
        canonicalName: true,
        type: true,
        dailySignals: {
          where: { source: 'TRENDS', geo: 'US' },
          orderBy: { date: 'desc' },
          take: 1,
        },
        flixPatrolTrailers: {
          orderBy: { fetchedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title not found' },
        { status: 404 }
      );
    }

    // Get latest trends score
    const trendsScore = title.dailySignals[0]?.value ?? undefined;

    // Calculate total trailer views
    const trailerViews = title.flixPatrolTrailers.reduce(
      (sum: number, t: { views: number | null }) => sum + (t.views || 0),
      0
    );

    // Generate market thesis
    const thesis = await generateMarketThesis(
      title.canonicalName,
      title.type as 'MOVIE' | 'SHOW',
      {
        trendsScore,
        trailerViews: trailerViews > 0 ? trailerViews : undefined,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        titleId: title.id,
        titleName: title.canonicalName,
        thesis: {
          summary: thesis.summary,
          confidence: thesis.confidence,
          starPowerScore: thesis.starPowerScore,
          notableCast: thesis.notableCast,
          signals: thesis.signals,
        },
      },
    });
  } catch (error) {
    console.error('Error generating thesis:', error);
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
