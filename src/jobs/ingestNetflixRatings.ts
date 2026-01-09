/**
 * Netflix Ratings Ingestion Job
 *
 * Fetches IMDB/RT ratings for titles appearing in current Polymarket Netflix markets.
 * Dynamically discovers all active markets (Global TV, US TV, Global Movie, US Movie).
 *
 * Run after market sync to ensure new titles have ratings.
 */

import prisma from '../lib/prisma';
import { searchOMDB, cleanTitleForSearch } from '../lib/omdb';
import { getCachedMarkets } from '../lib/marketCache';

interface IngestResult {
  titlesFound: number;
  alreadyHadRatings: number;
  newlyUpdated: number;
  notInDatabase: number;
  notInOMDB: number;
}

/**
 * Fetch title names from active Polymarket Netflix markets
 */
async function getPolymarketTitleNames(): Promise<Set<string>> {
  const titleNames = new Set<string>();

  // Get cached market slugs from database
  const cache = await getCachedMarkets();

  if (!cache || !cache.markets || cache.markets.length === 0) {
    console.log('[ingestNetflixRatings] No cached markets found, fetching from API...');
    return titleNames;
  }

  // Fetch each market's outcomes
  for (const cached of cache.markets) {
    if (cached.closed) continue; // Skip closed markets

    try {
      const res = await fetch(
        `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(cached.slug)}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!res.ok) continue;

      const events = await res.json();
      const event = events[0];

      if (!event?.markets) continue;

      for (const market of event.markets) {
        // Extract title name from groupItemTitle
        const title = market.groupItemTitle;
        if (title && !title.includes('Show ') && !title.includes('Movie ')) {
          titleNames.add(title);
        }
      }

      console.log(`[ingestNetflixRatings] ${cached.slug}: found ${event.markets.length} outcomes`);
    } catch (error) {
      console.error(`[ingestNetflixRatings] Failed to fetch ${cached.slug}:`, error);
    }
  }

  return titleNames;
}

/**
 * Match Polymarket title name to database title
 */
async function findDatabaseTitle(titleName: string) {
  // Try exact match first
  let title = await prisma.title.findFirst({
    where: { canonicalName: { equals: titleName, mode: 'insensitive' } },
    select: { id: true, canonicalName: true, type: true, imdbRating: true, ratingsUpdatedAt: true },
  });

  if (title) return title;

  // Try without season suffix (e.g., "Stranger Things: Season 5" -> "Stranger Things")
  const baseName = titleName
    .replace(/:\s*(Season|Limited Series|Part)\s*\d*/i, '')
    .replace(/\s*\d+$/, '') // Remove trailing numbers
    .trim();

  if (baseName !== titleName) {
    title = await prisma.title.findFirst({
      where: { canonicalName: { contains: baseName, mode: 'insensitive' } },
      select: { id: true, canonicalName: true, type: true, imdbRating: true, ratingsUpdatedAt: true },
    });
  }

  return title;
}

export async function ingestNetflixRatings(options?: {
  forceRefresh?: boolean;
}): Promise<IngestResult> {
  const { forceRefresh = false } = options ?? {};

  const result: IngestResult = {
    titlesFound: 0,
    alreadyHadRatings: 0,
    newlyUpdated: 0,
    notInDatabase: 0,
    notInOMDB: 0,
  };

  console.log('[ingestNetflixRatings] Starting...');

  // Get all title names from active Polymarket markets
  const titleNames = await getPolymarketTitleNames();
  result.titlesFound = titleNames.size;

  console.log(`[ingestNetflixRatings] Found ${titleNames.size} titles in Polymarket markets`);

  if (titleNames.size === 0) {
    console.log('[ingestNetflixRatings] No titles found, skipping');
    return result;
  }

  // Process each title
  for (const titleName of titleNames) {
    const title = await findDatabaseTitle(titleName);

    if (!title) {
      console.log(`  ❌ ${titleName}: Not in database`);
      result.notInDatabase++;
      continue;
    }

    // Skip if already has ratings (unless force refresh)
    if (title.imdbRating && !forceRefresh) {
      console.log(`  ✓ ${title.canonicalName}: Already has IMDB ${title.imdbRating}`);
      result.alreadyHadRatings++;
      continue;
    }

    // Fetch from OMDB
    const searchTitle = cleanTitleForSearch(title.canonicalName);
    const type = title.type === 'SHOW' ? 'series' : 'movie';

    console.log(`  🔍 ${title.canonicalName}: Searching OMDB...`);

    try {
      const ratings = await searchOMDB(searchTitle, type);

      if (ratings?.imdbRating) {
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
        console.log(`     ✅ IMDB: ${ratings.imdbRating}/10 | RT: ${ratings.rtCriticScore ?? 'N/A'}%`);
        result.newlyUpdated++;
      } else {
        // Mark as checked so we don't retry every time
        await prisma.title.update({
          where: { id: title.id },
          data: { ratingsUpdatedAt: new Date() },
        });
        console.log(`     ⚠️ Not found in OMDB`);
        result.notInOMDB++;
      }
    } catch (error) {
      console.error(`     ❌ Error fetching OMDB:`, error);
      result.notInOMDB++;
    }

    // Rate limit: 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('\n[ingestNetflixRatings] Complete');
  console.log(`  Titles found: ${result.titlesFound}`);
  console.log(`  Already had ratings: ${result.alreadyHadRatings}`);
  console.log(`  Newly updated: ${result.newlyUpdated}`);
  console.log(`  Not in database: ${result.notInDatabase}`);
  console.log(`  Not in OMDB: ${result.notInOMDB}`);

  return result;
}

// Run directly
if (require.main === module) {
  ingestNetflixRatings()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
