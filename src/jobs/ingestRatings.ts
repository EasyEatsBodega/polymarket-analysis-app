/**
 * Ratings Ingestion Job
 *
 * Fetches IMDB ratings from OMDB API and Rotten Tomatoes scores directly from RT.
 * Only processes titles that are currently active on Polymarket markets.
 *
 * OMDB Free tier: 1,000 requests/day
 *
 * Run manually: npx tsx src/jobs/ingestRatings.ts
 */

import prisma from '../lib/prisma';
import { searchOMDB, cleanTitleForSearch } from '../lib/omdb';
import { fetchRTScores, hasRTSlug } from '../lib/rottenTomatoes';
import { getActivePolymarketTitles, isTitleActive } from '../lib/activeMarkets';

interface IngestResult {
  processed: number;
  updated: number;
  notFound: number;
  errors: number;
  skipped: number;
  rtUpdated: number;
}

export async function ingestRatings(options?: {
  forceRefresh?: boolean;
  limit?: number;
  titleIds?: string[];
  activeOnly?: boolean; // Default true - only fetch for currently active Polymarket titles
}): Promise<IngestResult> {
  const { forceRefresh = false, limit, titleIds, activeOnly = true } = options ?? {};

  const result: IngestResult = {
    processed: 0,
    updated: 0,
    notFound: 0,
    errors: 0,
    skipped: 0,
    rtUpdated: 0,
  };

  // Get currently active titles from Polymarket
  let activeTitles = new Set<string>();
  if (activeOnly) {
    console.log('Fetching active Polymarket titles...');
    activeTitles = await getActivePolymarketTitles();
    console.log(`Found ${activeTitles.size} active titles on Polymarket`);
  }

  // Get titles to process - only those with Polymarket external IDs
  let titles;

  const polymarketFilter = {
    externalIds: { some: { provider: 'polymarket' } },
  };

  if (titleIds && titleIds.length > 0) {
    titles = await prisma.title.findMany({
      where: { id: { in: titleIds }, ...polymarketFilter },
      orderBy: { updatedAt: 'desc' },
      take: limit ?? 50,
    });
  } else if (!forceRefresh) {
    // Only get titles without ratings or with stale ratings (> 7 days old)
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 7);

    titles = await prisma.title.findMany({
      where: {
        ...polymarketFilter,
        OR: [{ ratingsUpdatedAt: null }, { ratingsUpdatedAt: { lt: staleDate } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit ?? 50,
    });
  } else {
    titles = await prisma.title.findMany({
      where: polymarketFilter,
      orderBy: { updatedAt: 'desc' },
      take: limit ?? 50,
    });
  }

  console.log(`\nProcessing ${titles.length} titles for ratings...`);

  for (const title of titles) {
    // Skip if not active on Polymarket (when activeOnly is true)
    if (activeOnly && activeTitles.size > 0 && !isTitleActive(title.canonicalName, activeTitles)) {
      console.log(`⏭️  Skipping ${title.canonicalName} (not active this week)`);
      result.skipped++;
      continue;
    }

    result.processed++;

    // Clean title for search
    const searchTitle = cleanTitleForSearch(title.canonicalName);
    const type = title.type === 'SHOW' ? 'series' : 'movie';

    console.log(`\n[${result.processed}] ${title.canonicalName}`);
    console.log(`  Searching: "${searchTitle}" (${type})`);

    try {
      // Step 1: Get IMDB data from OMDB
      let ratings = await searchOMDB(searchTitle, type);

      if (!ratings) {
        // Try without type restriction
        ratings = await searchOMDB(searchTitle);
      }

      // Step 2: Get RT scores directly from Rotten Tomatoes (more reliable)
      let rtScore: number | null = null;
      if (hasRTSlug(title.canonicalName)) {
        const rtData = await fetchRTScores(title.canonicalName);
        if (rtData?.tomatometer) {
          rtScore = rtData.tomatometer;
          result.rtUpdated++;
          console.log(`  🍅 RT Direct: ${rtScore}%`);
        }
      }

      // Use RT score from direct fetch, fall back to OMDB if available
      const finalRtScore = rtScore ?? ratings?.rtCriticScore ?? null;

      if (ratings || rtScore) {
        // Update title with ratings
        await prisma.title.update({
          where: { id: title.id },
          data: {
            imdbId: ratings?.imdbId ?? undefined,
            imdbRating: ratings?.imdbRating ?? undefined,
            imdbVotes: ratings?.imdbVotes ?? undefined,
            rtCriticScore: finalRtScore,
            metascore: ratings?.metascore ?? undefined,
            rated: ratings?.rated ?? undefined,
            ratingsUpdatedAt: new Date(),
          },
        });

        console.log(
          `  ✅ IMDB: ${ratings?.imdbRating ?? 'N/A'}/10 (${ratings?.imdbVotes?.toLocaleString() ?? 0} votes)`
        );
        console.log(`     RT: ${finalRtScore ?? 'N/A'}% | Metascore: ${ratings?.metascore ?? 'N/A'}`);

        result.updated++;
      } else {
        console.log(`  ❌ Not found in OMDB or RT`);
        result.notFound++;

        // Mark as checked so we don't keep retrying
        await prisma.title.update({
          where: { id: title.id },
          data: { ratingsUpdatedAt: new Date() },
        });
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error);
      result.errors++;
    }

    // Rate limit: 200ms between requests (be nice to RT)
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Ratings Ingestion Complete');
  console.log('='.repeat(50));
  console.log(`Processed: ${result.processed}`);
  console.log(`Updated:   ${result.updated}`);
  console.log(`RT Direct: ${result.rtUpdated}`);
  console.log(`Skipped:   ${result.skipped}`);
  console.log(`Not Found: ${result.notFound}`);
  console.log(`Errors:    ${result.errors}`);

  return result;
}

// Run directly
if (require.main === module) {
  ingestRatings()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
