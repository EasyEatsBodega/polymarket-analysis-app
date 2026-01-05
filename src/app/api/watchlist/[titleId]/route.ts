/**
 * Watchlist Item API
 *
 * Manages individual pinned title operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ titleId: string }>;
}

/**
 * GET /api/watchlist/[titleId]
 * Check if a specific title is in the watchlist
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { titleId } = await params;

    const pinned = await prisma.pinnedTitle.findUnique({
      where: { titleId },
      include: {
        title: true,
      },
    });

    if (!pinned) {
      return NextResponse.json({
        success: true,
        data: { isPinned: false },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        isPinned: true,
        id: pinned.id,
        titleId: pinned.titleId,
        pinnedAt: pinned.pinnedAt,
        title: {
          id: pinned.title.id,
          name: pinned.title.canonicalName,
          type: pinned.title.type,
        },
      },
    });
  } catch (error) {
    console.error('Error checking watchlist:', error);
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

/**
 * DELETE /api/watchlist/[titleId]
 * Remove a title from the watchlist
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { titleId } = await params;

    // Check if pinned
    const existing = await prisma.pinnedTitle.findUnique({
      where: { titleId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Title is not in watchlist' },
        { status: 404 }
      );
    }

    // Delete pinned title
    await prisma.pinnedTitle.delete({
      where: { titleId },
    });

    return NextResponse.json({
      success: true,
      message: 'Title removed from watchlist',
    });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
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
