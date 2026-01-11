/**
 * FlixPatrol Daily Rankings Ingestion Job
 *
 * Scrapes daily Netflix Top 10 rankings from FlixPatrol.
 * Data includes:
 * - TV Shows Top 10 (worldwide and US)
 * - Movies Top 10 (worldwide and US)
 * - Points score for each title
 */

import axios from 'axios';
import prisma from '@/lib/prisma';
import { normalizeTitle } from '@/lib/titleNormalize';

const FLIXPATROL_BASE_URL = 'https://flixpatrol.com';

// Region configurations for FlixPatrol URLs
const REGION_PATHS: Record<string, string> = {
  world: 'world',
  us: 'united-states',
};

interface FlixPatrolEntry {
  rank: number;
  titleName: string;
  titleSlug: string;
  points: number;
  category: 'tv' | 'movies';
}

interface IngestResult {
  date: string;
  region: string;
  tvShowsIngested: number;
  moviesIngested: number;
  titlesMatched: number;
  errors: string[];
}

interface CombinedIngestResult {
  date: string;
  regions: IngestResult[];
  totalTvShows: number;
  totalMovies: number;
  totalMatched: number;
  errors: string[];
}

/**
 * Fetch and parse FlixPatrol page HTML for a specific region
 */
async function fetchFlixPatrolPage(region: string = 'world', date?: string): Promise<string> {
  const regionPath = REGION_PATHS[region] || 'world';
  const url = date
    ? `${FLIXPATROL_BASE_URL}/top10/netflix/${regionPath}/${date}/`
    : `${FLIXPATROL_BASE_URL}/top10/netflix/${regionPath}/`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Parse rankings from FlixPatrol HTML
 * Returns TV shows and movies separately
 */
function parseFlixPatrolHTML(html: string): {
  tvShows: FlixPatrolEntry[];
  movies: FlixPatrolEntry[];
} {
  const tvShows: FlixPatrolEntry[] = [];
  const movies: FlixPatrolEntry[] = [];

  // Extract all ranking entries using regex
  // Pattern: rank number, title link, points
  const rankPattern =
    /<td[^>]*>(\d+)\.<\/td>[\s\S]*?href="\/title\/([^"]+)\/"[\s\S]*?<td[^>]*>(\d+)<\/td>/g;

  let match;
  let currentCategory: 'tv' | 'movies' = 'tv';
  let lastRank = 0;

  while ((match = rankPattern.exec(html)) !== null) {
    const rank = parseInt(match[1], 10);
    const titleSlug = match[2];
    const points = parseInt(match[3], 10);

    // Detect category switch - when rank goes back to 1, we're in movies section
    if (rank === 1 && lastRank >= 10) {
      currentCategory = 'movies';
    }
    lastRank = rank;

    // Convert slug to readable name
    const titleName = titleSlug
      .replace(/-\d{4}$/, '') // Remove year suffix like "-2017"
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const entry: FlixPatrolEntry = {
      rank,
      titleName,
      titleSlug,
      points,
      category: currentCategory,
    };

    if (currentCategory === 'tv' && rank <= 10) {
      tvShows.push(entry);
    } else if (currentCategory === 'movies' && rank <= 10) {
      movies.push(entry);
    }
  }

  return { tvShows, movies };
}

/**
 * Try to match FlixPatrol title to existing Title in database
 * Uses normalized matching to handle variations like "His Hers" vs "His & Hers"
 */
async function matchTitle(
  titleName: string,
  category: 'tv' | 'movies'
): Promise<string | null> {
  const titleType = category === 'tv' ? 'SHOW' : 'MOVIE';

  // Normalize the incoming title name for matching
  const normalizedInput = normalizeTitle(titleName, titleType);

  // Try exact match first
  const exactMatch = await prisma.title.findFirst({
    where: {
      type: titleType,
      canonicalName: {
        equals: titleName,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (exactMatch) return exactMatch.id;

  // Try normalized match - compare the .normalized string property
  const titles = await prisma.title.findMany({
    where: { type: titleType },
    select: { id: true, canonicalName: true },
  });

  for (const title of titles) {
    const normalizedExisting = normalizeTitle(title.canonicalName, titleType);
    // Compare the normalized strings (lowercase alphanumeric only)
    if (normalizedExisting.normalized === normalizedInput.normalized) {
      console.log(`  Matched "${titleName}" → "${title.canonicalName}" via normalization`);
      return title.id;
    }
  }

  return null;
}

/**
 * Ingest FlixPatrol data for a specific region
 */
async function ingestFlixPatrolForRegion(
  region: string,
  dateStr?: string
): Promise<IngestResult> {
  const result: IngestResult = {
    date: dateStr || new Date().toISOString().split('T')[0],
    region,
    tvShowsIngested: 0,
    moviesIngested: 0,
    titlesMatched: 0,
    errors: [],
  };

  try {
    console.log(`\nFetching FlixPatrol ${region.toUpperCase()} data for ${result.date}...`);

    // Fetch and parse HTML
    const html = await fetchFlixPatrolPage(region, dateStr);
    const { tvShows, movies } = parseFlixPatrolHTML(html);

    console.log(`Parsed ${tvShows.length} TV shows and ${movies.length} movies for ${region}`);

    const date = new Date(result.date);
    date.setUTCHours(0, 0, 0, 0);

    // Process TV shows
    for (const entry of tvShows) {
      try {
        const titleId = await matchTitle(entry.titleName, 'tv');

        await prisma.flixPatrolDaily.upsert({
          where: {
            date_platform_region_category_rank: {
              date,
              platform: 'netflix',
              region,
              category: 'tv',
              rank: entry.rank,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region,
            category: 'tv',
            rank: entry.rank,
            points: entry.points,
            titleName: entry.titleName,
            titleSlug: entry.titleSlug,
            titleId,
          },
          update: {
            points: entry.points,
            titleName: entry.titleName,
            titleSlug: entry.titleSlug,
            titleId,
          },
        });

        result.tvShowsIngested++;
        if (titleId) result.titlesMatched++;

        console.log(
          `  [${region}] TV #${entry.rank}: ${entry.titleName} (${entry.points} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`[${region}] TV ${entry.rank}: ${error}`);
      }
    }

    // Process movies
    for (const entry of movies) {
      try {
        const titleId = await matchTitle(entry.titleName, 'movies');

        await prisma.flixPatrolDaily.upsert({
          where: {
            date_platform_region_category_rank: {
              date,
              platform: 'netflix',
              region,
              category: 'movies',
              rank: entry.rank,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region,
            category: 'movies',
            rank: entry.rank,
            points: entry.points,
            titleName: entry.titleName,
            titleSlug: entry.titleSlug,
            titleId,
          },
          update: {
            points: entry.points,
            titleName: entry.titleName,
            titleSlug: entry.titleSlug,
            titleId,
          },
        });

        result.moviesIngested++;
        if (titleId) result.titlesMatched++;

        console.log(
          `  [${region}] Movie #${entry.rank}: ${entry.titleName} (${entry.points} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`[${region}] Movie ${entry.rank}: ${error}`);
      }
    }

    console.log(
      `FlixPatrol ${region} complete: ${result.tvShowsIngested} TV, ${result.moviesIngested} movies, ${result.titlesMatched} matched`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`[${region}] Fatal error: ${errorMsg}`);
    console.error(`FlixPatrol ${region} ingestion failed:`, error);
  }

  return result;
}

/**
 * Main ingestion function - ingests both World and US data
 */
export async function ingestFlixPatrol(dateStr?: string): Promise<CombinedIngestResult> {
  const date = dateStr || new Date().toISOString().split('T')[0];
  const regions = ['world', 'us'];

  console.log(`=== FlixPatrol Ingestion for ${date} ===`);

  const regionResults: IngestResult[] = [];

  for (const region of regions) {
    const result = await ingestFlixPatrolForRegion(region, dateStr);
    regionResults.push(result);

    // Small delay between regions to be nice to the server
    await new Promise((r) => setTimeout(r, 1000));
  }

  const combined: CombinedIngestResult = {
    date,
    regions: regionResults,
    totalTvShows: regionResults.reduce((sum, r) => sum + r.tvShowsIngested, 0),
    totalMovies: regionResults.reduce((sum, r) => sum + r.moviesIngested, 0),
    totalMatched: regionResults.reduce((sum, r) => sum + r.titlesMatched, 0),
    errors: regionResults.flatMap((r) => r.errors),
  };

  console.log(`\n=== FlixPatrol Ingestion Complete ===`);
  console.log(`Total: ${combined.totalTvShows} TV shows, ${combined.totalMovies} movies, ${combined.totalMatched} matched`);

  return combined;
}

/**
 * Ingest a single region (for API endpoint compatibility)
 */
export async function ingestFlixPatrolSingleRegion(
  region: string,
  dateStr?: string
): Promise<IngestResult> {
  return ingestFlixPatrolForRegion(region, dateStr);
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];
  const regionArg = process.argv.find((a) => a.startsWith('--region='))?.split('=')[1];

  // If specific region requested, only ingest that region
  if (regionArg) {
    ingestFlixPatrolForRegion(regionArg, dateArg)
      .then((result) => {
        console.log('\nResult:', JSON.stringify(result, null, 2));
        process.exit(result.errors.length > 0 ? 1 : 0);
      })
      .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  } else {
    // Ingest all regions
    ingestFlixPatrol(dateArg)
      .then((result) => {
        console.log('\nResult:', JSON.stringify(result, null, 2));
        process.exit(result.errors.length > 0 ? 1 : 0);
      })
      .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  }
}
