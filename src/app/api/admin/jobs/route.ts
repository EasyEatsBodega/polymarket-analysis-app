/**
 * Admin Jobs API
 *
 * Returns job run history for the admin dashboard.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await prisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      jobs,
    });
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch jobs',
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
