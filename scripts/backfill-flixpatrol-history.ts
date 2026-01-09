/**
 * FlixPatrol Historical Backfill Script
 *
 * Fetches historical ranking data for titles in our database,
 * particularly focusing on Polymarket titles.
 *
 * Usage:
 *   npx tsx scripts/backfill-flixpatrol-history.ts
 *   npx tsx scripts/backfill-flixpatrol-history.ts --days=90
 *   npx tsx scripts/backfill-flixpatrol-history.ts --title="Stranger Things"
 */

import axios, { AxiosInstance } from 'axios';
import prisma from '../src/lib/prisma';

const FLIXPATROL_API_BASE = 'https://api.flixpatrol.com/v2';
const NETFLIX_COMPANY_ID = 'cmp_IA6TdMqwf6kuyQvxo9bJ4nKX';

interface BackfillResult {
  titlesProcessed: number;
  rankingsFound: number;
  rankingsStored: number;
  apiCallsUsed: number;
  errors: string[];
}

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
 * Search for a title in FlixPatrol and return its ID
 */
async function findFlixPatrolTitle(
  api: AxiosInstance,
  titleName: string
): Promise<{ id: string; title: string } | null> {
  try {
    // Try exact match first
    let response = await api.get('/titles', {
      params: { 'title[eq]': titleName },
    });

    if (response.data?.data?.[0]) {
      return {
        id: response.data.data[0].data.id,
        title: response.data.data[0].data.title,
      };
    }

    // Try with different variations
    const variations = [
      titleName.replace(/&/g, 'and'),
      titleName.replace(/and/gi, '&'),
      titleName.replace(/:/g, ''),
      titleName.split(':')[0].trim(),
    ];

    for (const variation of variations) {
      if (variation === titleName) continue;

      response = await api.get('/titles', {
        params: { 'title[eq]': variation },
      });

      if (response.data?.data?.[0]) {
        return {
          id: response.data.data[0].data.id,
          title: response.data.data[0].data.title,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Error searching for "${titleName}":`, error);
    return null;
  }
}

/**
 * Fetch all rankings for a FlixPatrol title ID
 */
async function fetchTitleRankings(
  api: AxiosInstance,
  fpTitleId: string
): Promise<
  Array<{
    date: string;
    ranking: number;
    value: number;
    countryId: string;
  }>
> {
  const rankings: Array<{
    date: string;
    ranking: number;
    value: number;
    countryId: string;
  }> = [];

  try {
    let nextUrl: string | null = `/rankings?movie[eq]=${fpTitleId}`;

    // Paginate through all results
    while (nextUrl) {
      const response = await api.get(nextUrl);

      if (response.data?.data) {
        for (const item of response.data.data) {
          const d = item.data;
          rankings.push({
            date: d.date?.from || d.date,
            ranking: d.ranking,
            value: d.value,
            countryId: d.country?.data?.id || 'world',
          });
        }
      }

      // Check for next page
      nextUrl = response.data?.links?.next
        ? response.data.links.next.replace(FLIXPATROL_API_BASE, '')
        : null;

      // Limit to avoid excessive API calls
      if (rankings.length >= 1000) {
        console.log('  Reached 1000 rankings limit, stopping pagination');
        break;
      }
    }
  } catch (error) {
    console.error(`Error fetching rankings for ${fpTitleId}:`, error);
  }

  return rankings;
}

/**
 * Main backfill function
 */
async function backfillFlixPatrolHistory(options: {
  days?: number;
  titleFilter?: string;
  polymarketOnly?: boolean;
}): Promise<BackfillResult> {
  const result: BackfillResult = {
    titlesProcessed: 0,
    rankingsFound: 0,
    rankingsStored: 0,
    apiCallsUsed: 0,
    errors: [],
  };

  const api = createApiClient();

  // Get titles to process
  let titles;
  if (options.titleFilter) {
    titles = await prisma.title.findMany({
      where: {
        canonicalName: { contains: options.titleFilter, mode: 'insensitive' },
      },
      select: { id: true, canonicalName: true, type: true },
    });
  } else if (options.polymarketOnly !== false) {
    // Default: only Polymarket titles
    titles = await prisma.title.findMany({
      where: {
        externalIds: { some: { provider: 'polymarket' } },
      },
      select: { id: true, canonicalName: true, type: true },
    });
  } else {
    titles = await prisma.title.findMany({
      select: { id: true, canonicalName: true, type: true },
      take: 50, // Limit for safety
    });
  }

  console.log(`\nProcessing ${titles.length} titles for FlixPatrol history...\n`);

  for (const title of titles) {
    console.log(`\n[${result.titlesProcessed + 1}/${titles.length}] ${title.canonicalName}`);

    // Find in FlixPatrol
    const fpTitle = await findFlixPatrolTitle(api, title.canonicalName);
    result.apiCallsUsed++;

    if (!fpTitle) {
      console.log('  → Not found in FlixPatrol');
      result.titlesProcessed++;
      continue;
    }

    console.log(`  → Found: ${fpTitle.title} (${fpTitle.id})`);

    // Fetch rankings
    const rankings = await fetchTitleRankings(api, fpTitle.id);
    result.apiCallsUsed++;
    result.rankingsFound += rankings.length;

    console.log(`  → ${rankings.length} historical rankings found`);

    if (rankings.length === 0) {
      result.titlesProcessed++;
      continue;
    }

    // Filter by date if specified
    let filteredRankings = rankings;
    if (options.days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.days);
      filteredRankings = rankings.filter((r) => new Date(r.date) >= cutoffDate);
      console.log(`  → ${filteredRankings.length} rankings within last ${options.days} days`);
    }

    // Store global rankings (aggregate by date, keep best rank)
    const globalRankingsByDate = new Map<string, { ranking: number; value: number }>();
    for (const r of filteredRankings) {
      const existing = globalRankingsByDate.get(r.date);
      if (!existing || r.ranking < existing.ranking) {
        globalRankingsByDate.set(r.date, { ranking: r.ranking, value: r.value });
      }
    }

    // Store in database
    let stored = 0;
    for (const [dateStr, { ranking, value }] of globalRankingsByDate) {
      try {
        const date = new Date(dateStr);
        date.setUTCHours(0, 0, 0, 0);

        // Create slug from title
        const titleSlug = title.canonicalName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        await prisma.flixPatrolDaily.upsert({
          where: {
            date_platform_region_category_rank: {
              date,
              platform: 'netflix',
              region: 'world',
              category: title.type === 'SHOW' ? 'tv' : 'movies',
              rank: ranking,
            },
          },
          create: {
            date,
            platform: 'netflix',
            region: 'world',
            category: title.type === 'SHOW' ? 'tv' : 'movies',
            rank: ranking,
            points: value,
            titleName: title.canonicalName,
            titleSlug,
            titleId: title.id,
          },
          update: {
            points: value,
            titleName: title.canonicalName,
            titleSlug,
            titleId: title.id,
          },
        });
        stored++;
      } catch (error) {
        // Ignore unique constraint violations (different title at same rank)
      }
    }

    result.rankingsStored += stored;
    console.log(`  → Stored ${stored} rankings`);

    result.titlesProcessed++;

    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  return result;
}

// Parse command line arguments
const args = process.argv.slice(2);
const daysArg = args.find((a) => a.startsWith('--days='));
const titleArg = args.find((a) => a.startsWith('--title='));
const allArg = args.includes('--all');

const options = {
  days: daysArg ? parseInt(daysArg.split('=')[1]) : undefined,
  titleFilter: titleArg ? titleArg.split('=')[1] : undefined,
  polymarketOnly: !allArg,
};

console.log('FlixPatrol Historical Backfill');
console.log('==============================');
console.log('Options:', options);

backfillFlixPatrolHistory(options)
  .then((result) => {
    console.log('\n==============================');
    console.log('Backfill Complete!');
    console.log(`  Titles processed: ${result.titlesProcessed}`);
    console.log(`  Rankings found: ${result.rankingsFound}`);
    console.log(`  Rankings stored: ${result.rankingsStored}`);
    console.log(`  API calls used: ${result.apiCallsUsed}`);

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
    }

    process.exit(0);
  })
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
