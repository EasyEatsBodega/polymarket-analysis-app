/**
 * FlixPatrol API v2 Ingestion Job
 *
 * Fetches daily Netflix Top 10 rankings and social data via FlixPatrol API.
 * Replaces the HTML scraping approach with reliable API calls.
 */

import axios, { AxiosInstance } from 'axios';
import prisma from '@/lib/prisma';
import { normalizeTitle } from '@/lib/titleNormalize';

const FLIXPATROL_API_BASE = 'https://api.flixpatrol.com/v2';
const NETFLIX_COMPANY_ID = 'cmp_IA6TdMqwf6kuyQvxo9bJ4nKX';

interface FlixPatrolTitle {
  id: string;
  title: string;
  imdbId: number | null;
  tmdbId: number | null;
}

interface FlixPatrolTop10Entry {
  id: string;
  movie: {
    data: FlixPatrolTitle;
  };
  country?: {
    data?: {
      id: string; // country code like 'world', 'us', 'in', etc.
    };
  };
  date: {
    from: string;
    to: string;
  };
  ranking: number;
  value: number; // points
  type: number; // 1=Movie, 2=TV Show
}

interface IngestResult {
  date: string;
  tvShowsIngested: number;
  moviesIngested: number;
  titlesMatched: number;
  apiCallsUsed: number;
  errors: string[];
}

/**
 * Create authenticated API client
 */
function createApiClient(): AxiosInstance {
  const apiKey = process.env.FLIXPATROL_API_KEY;
  if (!apiKey) {
    throw new Error('FLIXPATROL_API_KEY environment variable not set');
  }

  return axios.create({
    baseURL: FLIXPATROL_API_BASE,
    auth: { username: apiKey, password: '' },
    headers: { Accept: 'application/json' },
    timeout: 30000,
  });
}

/**
 * Fetch TOP 10 entries for a specific date from FlixPatrol API
 */
async function fetchTop10FromAPI(
  api: AxiosInstance,
  dateStr: string
): Promise<{ tv: FlixPatrolTop10Entry[]; movies: FlixPatrolTop10Entry[] }> {
  const tv: FlixPatrolTop10Entry[] = [];
  const movies: FlixPatrolTop10Entry[] = [];

  try {
    // Fetch TOP 10 entries filtered by Netflix and date
    const response = await api.get('/top10s', {
      params: {
        'company[eq]': NETFLIX_COMPANY_ID,
        'date[from][eq]': dateStr,
        'date[to][eq]': dateStr,
      },
    });

    if (response.data?.data) {
      // Note: API returns country-specific rankings only, not worldwide aggregates.
      // For worldwide data, use the scrape method instead (default).
      // This API method processes all entries but may overwrite due to rank collision.
      for (const item of response.data.data) {
        const entry = item.data as FlixPatrolTop10Entry;

        // type: 1=Movie, 2=TV Show, 3=? (some entries have type 3)
        if (entry.type === 2 || entry.type === 3) {
          tv.push(entry);
        } else if (entry.type === 1) {
          movies.push(entry);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching TOP 10:', error);
  }

  return { tv, movies };
}

/**
 * Try to match FlixPatrol title to existing Title in database
 * Uses IMDB ID, TMDB ID, or name matching
 */
async function matchTitle(
  flixPatrolTitle: FlixPatrolTitle,
  category: 'tv' | 'movies'
): Promise<string | null> {
  const titleType = category === 'tv' ? 'SHOW' : 'MOVIE';

  // Try IMDB ID match first (most reliable)
  if (flixPatrolTitle.imdbId) {
    const imdbMatch = await prisma.title.findFirst({
      where: {
        externalIds: {
          some: {
            provider: 'imdb',
            externalId: `tt${flixPatrolTitle.imdbId}`,
          },
        },
      },
      select: { id: true },
    });
    if (imdbMatch) return imdbMatch.id;
  }

  // Try TMDB ID match
  if (flixPatrolTitle.tmdbId) {
    const tmdbMatch = await prisma.title.findFirst({
      where: {
        externalIds: {
          some: {
            provider: 'tmdb',
            externalId: String(flixPatrolTitle.tmdbId),
          },
        },
      },
      select: { id: true },
    });
    if (tmdbMatch) return tmdbMatch.id;
  }

  // Try exact name match
  const exactMatch = await prisma.title.findFirst({
    where: {
      type: titleType,
      canonicalName: {
        equals: flixPatrolTitle.title,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });
  if (exactMatch) return exactMatch.id;

  // Try normalized name match
  const normalized = normalizeTitle(flixPatrolTitle.title);
  const titles = await prisma.title.findMany({
    where: { type: titleType },
    select: { id: true, canonicalName: true },
  });

  for (const title of titles) {
    if (normalizeTitle(title.canonicalName) === normalized) {
      return title.id;
    }
  }

  return null;
}

/**
 * Main API-based ingestion function
 */
export async function ingestFlixPatrolAPI(dateStr?: string): Promise<IngestResult> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  const result: IngestResult = {
    date: targetDate,
    tvShowsIngested: 0,
    moviesIngested: 0,
    titlesMatched: 0,
    apiCallsUsed: 0,
    errors: [],
  };

  try {
    const api = createApiClient();
    console.log(`Fetching FlixPatrol API data for ${targetDate}...`);

    // Fetch TOP 10 data
    const { tv, movies } = await fetchTop10FromAPI(api, targetDate);
    result.apiCallsUsed++;

    console.log(`API returned ${tv.length} TV entries and ${movies.length} movie entries`);

    const date = new Date(targetDate);
    date.setUTCHours(0, 0, 0, 0);

    // Process TV shows
    for (const entry of tv) {
      try {
        const fpTitle = entry.movie?.data;
        if (!fpTitle) continue;

        const titleId = await matchTitle(fpTitle, 'tv');

        // Create slug from title
        const titleSlug = fpTitle.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        await prisma.flixPatrolDaily.upsert({
          where: {
            date_platform_region_category_rank: {
              date,
              platform: 'netflix',
              region: 'world',
              category: 'tv',
              rank: entry.ranking,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region: 'world',
            category: 'tv',
            rank: entry.ranking,
            points: entry.value,
            titleName: fpTitle.title,
            titleSlug,
            titleId,
          },
          update: {
            points: entry.value,
            titleName: fpTitle.title,
            titleSlug,
            titleId,
          },
        });

        result.tvShowsIngested++;
        if (titleId) result.titlesMatched++;

        console.log(
          `  TV #${entry.ranking}: ${fpTitle.title} (${entry.value} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`TV ${entry.ranking}: ${error}`);
      }
    }

    // Process movies
    for (const entry of movies) {
      try {
        const fpTitle = entry.movie?.data;
        if (!fpTitle) continue;

        const titleId = await matchTitle(fpTitle, 'movies');

        const titleSlug = fpTitle.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        await prisma.flixPatrolDaily.upsert({
          where: {
            date_platform_region_category_rank: {
              date,
              platform: 'netflix',
              region: 'world',
              category: 'movies',
              rank: entry.ranking,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region: 'world',
            category: 'movies',
            rank: entry.ranking,
            points: entry.value,
            titleName: fpTitle.title,
            titleSlug,
            titleId,
          },
          update: {
            points: entry.value,
            titleName: fpTitle.title,
            titleSlug,
            titleId,
          },
        });

        result.moviesIngested++;
        if (titleId) result.titlesMatched++;

        console.log(
          `  Movie #${entry.ranking}: ${fpTitle.title} (${entry.value} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`Movie ${entry.ranking}: ${error}`);
      }
    }

    console.log(
      `FlixPatrol API ingestion complete: ${result.tvShowsIngested} TV, ${result.moviesIngested} movies, ${result.titlesMatched} matched`
    );
    console.log(`API calls used: ${result.apiCallsUsed}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Fatal error: ${errorMsg}`);
    console.error('FlixPatrol API ingestion failed:', error);
  }

  return result;
}

/**
 * Fetch rankings for a specific title (for historical backfill)
 */
export async function fetchTitleRankings(
  api: AxiosInstance,
  flixPatrolTitleId: string
): Promise<FlixPatrolTop10Entry[]> {
  try {
    const response = await api.get('/rankings', {
      params: { 'movie[eq]': flixPatrolTitleId },
    });

    if (response.data?.data) {
      return response.data.data.map((item: { data: FlixPatrolTop10Entry }) => item.data);
    }
  } catch (error) {
    console.error(`Error fetching rankings for ${flixPatrolTitleId}:`, error);
  }

  return [];
}

/**
 * Search for a title in FlixPatrol
 */
export async function searchFlixPatrolTitle(
  api: AxiosInstance,
  titleName: string
): Promise<FlixPatrolTitle | null> {
  try {
    const response = await api.get('/titles', {
      params: { 'title[eq]': titleName },
    });

    if (response.data?.data?.[0]) {
      return response.data.data[0].data;
    }
  } catch (error) {
    console.error(`Error searching for "${titleName}":`, error);
  }

  return null;
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];

  ingestFlixPatrolAPI(dateArg)
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
