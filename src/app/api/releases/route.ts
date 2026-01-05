/**
 * Release Candidates API
 *
 * Manages upcoming Netflix release candidates for tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TitleType, CandidateStatus } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases
 * Returns release candidates with optional filtering
 *
 * Query params:
 * - status: filter by status (PENDING, MATCHED, REJECTED, RELEASED)
 * - type: filter by title type (SHOW, MOVIE)
 * - limit: max results (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as CandidateStatus | null;
    const type = searchParams.get('type') as TitleType | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const whereClause: {
      status?: CandidateStatus;
      type?: TitleType;
    } = {};

    if (status) {
      whereClause.status = status;
    }
    if (type) {
      whereClause.type = type;
    }

    const candidates = await prisma.releaseCandidate.findMany({
      where: whereClause,
      take: limit,
      orderBy: [
        { releaseDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Fetch associated titles for matched candidates
    const titleIds = candidates
      .filter((c) => c.titleId !== null)
      .map((c) => c.titleId as string);

    const titles = titleIds.length > 0
      ? await prisma.title.findMany({
          where: { id: { in: titleIds } },
          select: { id: true, canonicalName: true, type: true },
        })
      : [];

    const titleMap = new Map(titles.map((t) => [t.id, t]));

    // Transform for response
    const releases = candidates.map((c) => {
      const title = c.titleId ? titleMap.get(c.titleId) : null;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        releaseDate: c.releaseDate?.toISOString() || null,
        source: c.source,
        sourceId: c.sourceId,
        status: c.status,
        titleId: c.titleId,
        title: title ? {
          id: title.id,
          name: title.canonicalName,
          type: title.type,
        } : null,
        metadata: c.metadata,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    // Group by status for summary
    const summary = {
      total: releases.length,
      pending: releases.filter((r) => r.status === 'PENDING').length,
      matched: releases.filter((r) => r.status === 'MATCHED').length,
      rejected: releases.filter((r) => r.status === 'REJECTED').length,
      released: releases.filter((r) => r.status === 'RELEASED').length,
    };

    return NextResponse.json({
      success: true,
      data: releases,
      summary,
    });
  } catch (error) {
    console.error('Error fetching releases:', error);
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
 * POST /api/releases
 * Create a new release candidate manually
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, releaseDate, metadata } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: 'name and type are required' },
        { status: 400 }
      );
    }

    if (!['SHOW', 'MOVIE'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'type must be SHOW or MOVIE' },
        { status: 400 }
      );
    }

    // Check for duplicate (same name, source=manual)
    const existing = await prisma.releaseCandidate.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        source: 'manual',
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A manual release with this name already exists' },
        { status: 409 }
      );
    }

    // Create release candidate
    const candidate = await prisma.releaseCandidate.create({
      data: {
        name,
        type: type as TitleType,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        source: 'manual',
        sourceId: `manual-${Date.now()}`,
        status: 'PENDING',
        metadata: metadata || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        releaseDate: candidate.releaseDate?.toISOString() || null,
        source: candidate.source,
        status: candidate.status,
        createdAt: candidate.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating release:', error);
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
