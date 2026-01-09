/**
 * Ratings Ingestion API Endpoint
 *
 * Fetches IMDB and Rotten Tomatoes scores from OMDB API.
 *
 * POST /api/jobs/ingest-ratings
 * - Requires CRON_SECRET or ADMIN_API_KEY
 * - Optional body: { forceRefresh?: boolean, limit?: number, titleIds?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestRatings } from '@/jobs/ingestRatings';

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const adminApiKey = process.env.ADMIN_API_KEY;

  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (adminApiKey && authHeader === `Bearer ${adminApiKey}`);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const result = await ingestRatings({
      forceRefresh: body.forceRefresh,
      limit: body.limit,
      titleIds: body.titleIds,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Ratings ingestion error:', error);
    return NextResponse.json(
      { success: false, error: 'Ratings ingestion failed' },
      { status: 500 }
    );
  }
}
