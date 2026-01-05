/**
 * Release Candidate Item API
 *
 * Manages individual release candidate operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CandidateStatus, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/releases/[id]
 * Get a specific release candidate
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const candidate = await prisma.releaseCandidate.findUnique({
      where: { id },
      include: {
        title: {
          select: {
            id: true,
            canonicalName: true,
            type: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { success: false, error: 'Release candidate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        releaseDate: candidate.releaseDate?.toISOString() || null,
        source: candidate.source,
        sourceId: candidate.sourceId,
        status: candidate.status,
        titleId: candidate.titleId,
        title: candidate.title ? {
          id: candidate.title.id,
          name: candidate.title.canonicalName,
          type: candidate.title.type,
        } : null,
        metadata: candidate.metadata,
        createdAt: candidate.createdAt.toISOString(),
        updatedAt: candidate.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching release:', error);
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
 * PATCH /api/releases/[id]
 * Update a release candidate (status, titleId, releaseDate, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, titleId, releaseDate, metadata, name } = body;

    // Check if candidate exists
    const existing = await prisma.releaseCandidate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Release candidate not found' },
        { status: 404 }
      );
    }

    // Build update data using Prisma's update input type
    const updateData: Prisma.ReleaseCandidateUpdateInput = {};

    if (status !== undefined) {
      if (!['PENDING', 'MATCHED', 'REJECTED', 'RELEASED'].includes(status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status' },
          { status: 400 }
        );
      }
      updateData.status = status as CandidateStatus;
    }

    if (titleId !== undefined) {
      if (titleId !== null) {
        // Verify title exists
        const titleRecord = await prisma.title.findUnique({
          where: { id: titleId },
        });

        if (!titleRecord) {
          return NextResponse.json(
            { success: false, error: 'Title not found' },
            { status: 404 }
          );
        }

        // When linking to a title, automatically set status to MATCHED
        updateData.title = { connect: { id: titleId } };
        if (!status) {
          updateData.status = 'MATCHED';
        }
      } else {
        // Unlink title
        updateData.title = { disconnect: true };
        if (!status) {
          updateData.status = 'PENDING';
        }
      }
    }

    if (releaseDate !== undefined) {
      updateData.releaseDate = releaseDate ? new Date(releaseDate) : null;
    }

    if (metadata !== undefined) {
      updateData.metadata = metadata;
    }

    if (name !== undefined) {
      updateData.name = name;
    }

    // Update the candidate
    const updated = await prisma.releaseCandidate.update({
      where: { id },
      data: updateData,
      include: {
        title: {
          select: {
            id: true,
            canonicalName: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        releaseDate: updated.releaseDate?.toISOString() || null,
        source: updated.source,
        status: updated.status,
        titleId: updated.titleId,
        title: updated.title ? {
          id: updated.title.id,
          name: updated.title.canonicalName,
          type: updated.title.type,
        } : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating release:', error);
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
 * DELETE /api/releases/[id]
 * Delete a release candidate
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Check if exists
    const existing = await prisma.releaseCandidate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Release candidate not found' },
        { status: 404 }
      );
    }

    // Delete
    await prisma.releaseCandidate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Release candidate deleted',
    });
  } catch (error) {
    console.error('Error deleting release:', error);
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
