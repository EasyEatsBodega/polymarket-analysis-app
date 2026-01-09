/**
 * Ratings Ingestion Job
 *
 * Fetches IMDB ratings and Rotten Tomatoes scores from OMDB API
 * for Polymarket-linked titles only (by default).
 *
 * OMDB Free tier: 1,000 requests/day
 *
 * Run manually: npx tsx src/jobs/ingestRatings.ts
 */

import prisma from '../lib/prisma';
import { searchOMDB, cleanTitleForSearch } from '../lib/omdb';

interface IngestResult {
  processed: number;
  updated: number;
  notFound: number;
  errors: number;
  skipped: number;
}

export async function ingestRatings(options?: {
  forceRefresh?: boolean;
  limit?: number;
  titleIds?: string[];
  polymarketOnly?: boolean; // Default true - only fetch for Polymarket titles
}): Promise<IngestResult> {
  const { forceRefresh = false, limit, titleIds, polymarketOnly = true } = options ?? {};

  const result: IngestResult = {
    processed: 0,
    updated: 0,
    notFound: 0,
    errors: 0,
    skipped: 0,
  };

  // Get titles to process
  let titles;

  // Build base filter for Polymarket-linked titles
  const polymarketFilter = polymarketOnly ? { marketLinks: { some: {} } } : {};

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
        OR: [
          { ratingsUpdatedAt: null },
          { ratingsUpdatedAt: { lt: staleDate } },
        ],
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
    result.processed++;

    // Clean title for search
    const searchTitle = cleanTitleForSearch(title.canonicalName);
    const type = title.type === 'SHOW' ? 'series' : 'movie';

    console.log(`\n[${result.processed}/${titles.length}] ${title.canonicalName}`);
    console.log(`  Searching: "${searchTitle}" (${type})`);

    try {
      const ratings = await searchOMDB(searchTitle, type);

      if (!ratings) {
        // Try without type restriction
        const ratingsAny = await searchOMDB(searchTitle);

        if (!ratingsAny) {
          console.log(`  ❌ Not found in OMDB`);
          result.notFound++;

          // Mark as checked so we don't keep retrying
          await prisma.title.update({
            where: { id: title.id },
            data: { ratingsUpdatedAt: new Date() },
          });
          continue;
        }

        // Use the result without type restriction
        Object.assign(ratings ?? {}, ratingsAny);
      }

      if (ratings) {
        // Update title with ratings
        await prisma.title.update({
          where: { id: title.id },
          data: {
            imdbId: ratings.imdbId,
            imdbRating: ratings.imdbRating,
            imdbVotes: ratings.imdbVotes,
            rtCriticScore: ratings.rtCriticScore,
            metascore: ratings.metascore,
            rated: ratings.rated,
            ratingsUpdatedAt: new Date(),
          },
        });

        console.log(`  ✅ IMDB: ${ratings.imdbRating ?? 'N/A'}/10 (${ratings.imdbVotes?.toLocaleString() ?? 0} votes)`);
        console.log(`     RT: ${ratings.rtCriticScore ?? 'N/A'}% | Metascore: ${ratings.metascore ?? 'N/A'}`);

        result.updated++;
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error);
      result.errors++;
    }

    // Rate limit: 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Ratings Ingestion Complete');
  console.log('='.repeat(50));
  console.log(`Processed: ${result.processed}`);
  console.log(`Updated:   ${result.updated}`);
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
