/**
 * Admin Jobs API
 *
 * Returns job run history for the admin dashboard.
 * Protected - requires admin authentication.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];

export async function GET() {
  try {
    // Verify admin access
    const { userId } = await auth();
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
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
      { success: false, error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
