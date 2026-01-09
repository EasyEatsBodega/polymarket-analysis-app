/**
 * Cron Job: Refresh Polymarket Market Discovery
 *
 * Runs daily at midnight EST to discover active Netflix markets.
 * Saves discovered slugs to database so user requests are fast.
 *
 * Schedule: 0 5 * * * (5:00 UTC = midnight EST)
 */

import { NextRequest, NextResponse } from 'next/server';
import { setCachedMarkets, updateLastKnownIds } from '@/lib/marketCache';
import { verifyJobAuth } from '@/lib/jobAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for market scanning

// Market patterns to discover
const MARKET_PATTERNS = [
  { pattern: 'what-will-be-the-top-us-netflix-show-this-week', name: 'US Shows #1' },
  { pattern: 'what-will-be-the-2-us-netflix-show-this-week', name: 'US Shows #2' },
  { pattern: 'what-will-be-the-top-global-netflix-show-this-week', name: 'Global Shows #1' },
  { pattern: 'what-will-be-the-2-global-netflix-show-this-week', name: 'Global Shows #2' },
  { pattern: 'what-will-be-the-top-us-netflix-movie-this-week', name: 'US Movies #1' },
  { pattern: 'what-will-be-the-2-us-netflix-movie-this-week', name: 'US Movies #2' },
  { pattern: 'what-will-be-the-top-global-netflix-movie-this-week', name: 'Global Movies #1' },
  { pattern: 'what-will-be-the-2-global-netflix-movie-this-week', name: 'Global Movies #2' },
];

// Scan ranges
const HOT_RANGES = {
  shows: { start: 450, end: 600 },
  movies: { start: 850, end: 950 },
};
const EXTENDED_RANGE = { start: 400, end: 1000 };
const SCAN_BATCH_SIZE = 30;

interface PolymarketEvent {
  id: string;
  slug: string;
  closed: boolean;
  markets: unknown[];
}

async function fetchEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return null;
    const events: PolymarketEvent[] = await response.json();
    if (events.length > 0 && events[0].markets?.length > 0) {
      return events[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function scanRange(
  basePattern: string,
  rangeStart: number,
  rangeEnd: number
): Promise<{ id: number; closed: boolean; slug: string } | null> {
  const foundMarkets: { id: number; closed: boolean; slug: string }[] = [];

  for (let start = rangeEnd; start >= rangeStart; start -= SCAN_BATCH_SIZE) {
    const batch: number[] = [];
    for (let id = start; id > Math.max(start - SCAN_BATCH_SIZE, rangeStart - 1); id--) {
      batch.push(id);
    }

    const results = await Promise.all(
      batch.map(async (id) => {
        const slug = `${basePattern}-${id}`;
        const event = await fetchEventBySlug(slug);
        return event ? { id, event, slug } : null;
      })
    );

    for (const result of results) {
      if (result) {
        foundMarkets.push({
          id: result.id,
          closed: result.event.closed,
          slug: result.slug
        });

        // If we found an ACTIVE market, return immediately
        if (!result.event.closed) {
          return { id: result.id, closed: false, slug: result.slug };
        }
      }
    }
  }

  if (foundMarkets.length > 0) {
    foundMarkets.sort((a, b) => b.id - a.id);
    return foundMarkets[0];
  }

  return null;
}

async function discoverMarket(pattern: string): Promise<{
  id: number | null;
  slug: string | null;
  status: 'active' | 'closed' | 'not_found';
}> {
  const isMovie = pattern.includes('movie');
  const hotRange = isMovie ? HOT_RANGES.movies : HOT_RANGES.shows;

  // Check hot range first
  const hotResult = await scanRange(pattern, hotRange.start, hotRange.end);
  if (hotResult && !hotResult.closed) {
    return { id: hotResult.id, slug: hotResult.slug, status: 'active' };
  }

  // Check extended ranges
  if (hotRange.start > EXTENDED_RANGE.start) {
    const belowResult = await scanRange(pattern, EXTENDED_RANGE.start, hotRange.start - 1);
    if (belowResult && !belowResult.closed) {
      return { id: belowResult.id, slug: belowResult.slug, status: 'active' };
    }
  }

  if (hotRange.end < EXTENDED_RANGE.end) {
    const aboveResult = await scanRange(pattern, hotRange.end + 1, EXTENDED_RANGE.end);
    if (aboveResult && !aboveResult.closed) {
      return { id: aboveResult.id, slug: aboveResult.slug, status: 'active' };
    }
  }

  // Return closed market if found
  if (hotResult) {
    return { id: hotResult.id, slug: hotResult.slug, status: 'closed' };
  }

  return { id: null, slug: null, status: 'not_found' };
}

export async function GET(request: NextRequest) {
  // Verify authorization
  const auth = verifyJobAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  console.log('[refresh-markets] Starting market discovery at', new Date().toISOString());

  const results: Array<{
    name: string;
    pattern: string;
    id: number | null;
    slug: string | null;
    status: string;
  }> = [];

  // Discover markets sequentially to avoid rate limiting
  for (const { pattern, name } of MARKET_PATTERNS) {
    console.log(`[refresh-markets] Discovering ${name}...`);
    const result = await discoverMarket(pattern);

    results.push({
      name,
      pattern,
      id: result.id,
      slug: result.slug,
      status: result.status,
    });

    if (result.status === 'active') {
      console.log(`[refresh-markets] ✅ ${name}: ACTIVE (ID: ${result.id})`);
    } else if (result.status === 'closed') {
      console.log(`[refresh-markets] ⚠️ ${name}: CLOSED (ID: ${result.id})`);
    } else {
      console.log(`[refresh-markets] ❌ ${name}: NOT FOUND`);
    }

    // Small delay between patterns to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  const duration = Date.now() - startTime;
  const activeCount = results.filter(r => r.status === 'active').length;
  const closedCount = results.filter(r => r.status === 'closed').length;

  console.log(`[refresh-markets] Completed in ${duration}ms`);
  console.log(`[refresh-markets] Active: ${activeCount}, Closed: ${closedCount}, Not found: ${results.length - activeCount - closedCount}`);

  // Save discovered markets to database cache
  const marketsToCache = results
    .filter(r => r.slug !== null && r.id !== null)
    .map(r => ({
      pattern: r.pattern,
      slug: r.slug!,
      id: r.id!,
      closed: r.status === 'closed',
      discoveredAt: new Date().toISOString(),
    }));

  if (marketsToCache.length > 0) {
    // Save full cache and update last known IDs (for faster future cold starts)
    await Promise.all([
      setCachedMarkets(marketsToCache),
      updateLastKnownIds(marketsToCache),
    ]);
    console.log(`[refresh-markets] Saved ${marketsToCache.length} markets to database cache and updated last known IDs`);
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: {
      active: activeCount,
      closed: closedCount,
      notFound: results.length - activeCount - closedCount,
      cached: marketsToCache.length,
    },
    markets: results,
  });
}
