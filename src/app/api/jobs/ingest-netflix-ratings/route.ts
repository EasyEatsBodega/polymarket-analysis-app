/**
 * Netflix Ratings Ingestion API Endpoint
 *
 * Fetches IMDB/RT ratings for titles in current Polymarket Netflix markets.
 * Call this after market sync to ensure new weekly titles have ratings.
 *
 * POST /api/jobs/ingest-netflix-ratings
 * - Requires CRON_SECRET or ADMIN_API_KEY
 * - Optional body: { forceRefresh?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestNetflixRatings } from '@/jobs/ingestNetflixRatings';

export const maxDuration = 120; // 2 minutes

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

    const result = await ingestNetflixRatings({
      forceRefresh: body.forceRefresh,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Netflix ratings ingestion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
