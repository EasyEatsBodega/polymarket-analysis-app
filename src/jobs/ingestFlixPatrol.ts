/**
 * FlixPatrol Daily Rankings Ingestion Job
 *
 * Scrapes daily Netflix Top 10 rankings from FlixPatrol.
 * Data includes:
 * - TV Shows Top 10 (worldwide)
 * - Movies Top 10 (worldwide)
 * - Points score for each title
 */

import axios from 'axios';
import prisma from '@/lib/prisma';
import { normalizeTitle } from '@/lib/titleNormalize';

const FLIXPATROL_BASE_URL = 'https://flixpatrol.com';

interface FlixPatrolEntry {
  rank: number;
  titleName: string;
  titleSlug: string;
  points: number;
  category: 'tv' | 'movies';
}

interface IngestResult {
  date: string;
  tvShowsIngested: number;
  moviesIngested: number;
  titlesMatched: number;
  errors: string[];
}

/**
 * Fetch and parse FlixPatrol page HTML
 */
async function fetchFlixPatrolPage(date?: string): Promise<string> {
  const url = date
    ? `${FLIXPATROL_BASE_URL}/top10/netflix/world/${date}/`
    : `${FLIXPATROL_BASE_URL}/top10/netflix/`;

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
 */
async function matchTitle(
  titleName: string,
  category: 'tv' | 'movies'
): Promise<string | null> {
  const titleType = category === 'tv' ? 'SHOW' : 'MOVIE';

  // Normalize the title name for matching
  const normalized = normalizeTitle(titleName);

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

  // Try normalized match
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
 * Main ingestion function
 */
export async function ingestFlixPatrol(dateStr?: string): Promise<IngestResult> {
  const result: IngestResult = {
    date: dateStr || new Date().toISOString().split('T')[0],
    tvShowsIngested: 0,
    moviesIngested: 0,
    titlesMatched: 0,
    errors: [],
  };

  try {
    console.log(`Fetching FlixPatrol data for ${result.date}...`);

    // Fetch and parse HTML
    const html = await fetchFlixPatrolPage(dateStr);
    const { tvShows, movies } = parseFlixPatrolHTML(html);

    console.log(`Parsed ${tvShows.length} TV shows and ${movies.length} movies`);

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
              region: 'world',
              category: 'tv',
              rank: entry.rank,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region: 'world',
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
          `  TV #${entry.rank}: ${entry.titleName} (${entry.points} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`TV ${entry.rank}: ${error}`);
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
              region: 'world',
              category: 'movies',
              rank: entry.rank,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region: 'world',
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
          `  Movie #${entry.rank}: ${entry.titleName} (${entry.points} pts)${titleId ? ' [matched]' : ''}`
        );
      } catch (error) {
        result.errors.push(`Movie ${entry.rank}: ${error}`);
      }
    }

    console.log(
      `FlixPatrol ingestion complete: ${result.tvShowsIngested} TV, ${result.moviesIngested} movies, ${result.titlesMatched} matched`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Fatal error: ${errorMsg}`);
    console.error('FlixPatrol ingestion failed:', error);
  }

  return result;
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];

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
