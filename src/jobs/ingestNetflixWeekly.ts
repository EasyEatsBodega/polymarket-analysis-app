/**
 * Netflix Weekly Data Ingestion Job
 *
 * Downloads and parses Netflix Top 10 XLSX files:
 * - all-weeks-global.xlsx: Global Top 10 with views/hours data
 * - all-weeks-countries.xlsx: Country-specific rankings (filtered to US)
 *
 * Normalizes titles and upserts to database.
 */

import axios from 'axios';
import * as XLSX from 'xlsx';
import { PrismaClient, TitleType } from '@prisma/client';
import { normalizeTitle, titlesMatch, mergeAliases } from '../lib/titleNormalize';

const prisma = new PrismaClient();

// Netflix data URLs
const NETFLIX_GLOBAL_URL = 'https://top10.netflix.com/data/all-weeks-global.xlsx';
const NETFLIX_COUNTRIES_URL = 'https://top10.netflix.com/data/all-weeks-countries.xlsx';

// Category mapping for TitleType
const CATEGORY_TYPE_MAP: Record<string, TitleType> = {
  'TV (English)': 'SHOW',
  'TV (Non-English)': 'SHOW',
  'Films (English)': 'MOVIE',
  'Films (Non-English)': 'MOVIE',
};

interface GlobalRow {
  week: string;
  category: string;
  weekly_rank: number;
  show_title: string;
  season_title?: string;
  weekly_hours_viewed: number;
  runtime?: string;
  weekly_views?: number;
  cumulative_weeks_in_top_10?: number;
}

interface CountryRow {
  country_iso2: string;
  country_name: string;
  week: string;
  category: string;
  weekly_rank: number;
  show_title: string;
  season_title?: string;
  cumulative_weeks_in_top_10?: number;
}

interface IngestResult {
  globalRowsProcessed: number;
  usRowsProcessed: number;
  titlesCreated: number;
  titlesUpdated: number;
  globalRecordsUpserted: number;
  usRecordsUpserted: number;
  errors: string[];
}

/**
 * Download XLSX file from URL and parse to JSON
 */
async function downloadAndParseXLSX<T>(url: string): Promise<T[]> {
  console.log(`Downloading: ${url}`);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000, // 60 second timeout
  });

  const workbook = XLSX.read(response.data, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json<T>(sheet);
}

/**
 * Parse week string to date range
 * Format: "2024-01-01 - 2024-01-07" or similar
 */
function parseWeekRange(weekStr: string): { weekStart: Date; weekEnd: Date } {
  // Split on " - " or " – " (with spaces to avoid splitting date hyphens)
  const parts = weekStr.split(/\s+[-–]\s+/);

  if (parts.length >= 2) {
    return {
      weekStart: new Date(parts[0].trim()),
      weekEnd: new Date(parts[1].trim()),
    };
  }

  // Single date - assume it's the week start, end is 6 days later
  const start = new Date(weekStr.trim());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return { weekStart: start, weekEnd: end };
}

/**
 * Parse runtime string to hours (e.g., "2:30:00" -> 2.5)
 */
function parseRuntimeHours(runtime: string | undefined): number | null {
  if (!runtime) return null;

  const parts = runtime.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] + parts[1] / 60 + parts[2] / 3600;
  }
  if (parts.length === 2) {
    return parts[0] + parts[1] / 60;
  }
  return null;
}

/**
 * Find or create a title in the database
 */
async function findOrCreateTitle(
  name: string,
  type: TitleType,
  titleCache: Map<string, { id: string; canonicalName: string; aliases: string[] | null }>
): Promise<string> {
  const normalized = normalizeTitle(name, type);
  const cacheKey = `${normalized.titleKey}`;

  // Check cache first
  if (titleCache.has(cacheKey)) {
    const cached = titleCache.get(cacheKey)!;

    // Update aliases if this is a new variant
    if (!titlesMatch(name, cached.canonicalName)) {
      const newAliases = mergeAliases(cached.aliases, name);
      if (newAliases.length !== (cached.aliases?.length ?? 0)) {
        await prisma.title.update({
          where: { id: cached.id },
          data: { aliases: newAliases },
        });
        cached.aliases = newAliases;
      }
    }

    return cached.id;
  }

  // Try to find existing title by canonical name
  let title = await prisma.title.findUnique({
    where: {
      canonicalName_type: {
        canonicalName: normalized.canonical,
        type,
      },
    },
  });

  if (!title) {
    // Create new title
    title = await prisma.title.create({
      data: {
        canonicalName: normalized.canonical,
        type,
        aliases: name !== normalized.canonical ? [name] : [],
      },
    });
  } else if (name !== normalized.canonical) {
    // Update aliases
    const aliases = (title.aliases as string[]) || [];
    const newAliases = mergeAliases(aliases, name);
    if (newAliases.length !== aliases.length) {
      await prisma.title.update({
        where: { id: title.id },
        data: { aliases: newAliases },
      });
    }
  }

  // Add to cache
  titleCache.set(cacheKey, {
    id: title.id,
    canonicalName: title.canonicalName,
    aliases: title.aliases as string[] | null,
  });

  return title.id;
}

/**
 * Process global Top 10 data
 */
async function processGlobalData(
  rows: GlobalRow[],
  titleCache: Map<string, { id: string; canonicalName: string; aliases: string[] | null }>,
  result: IngestResult
): Promise<void> {
  console.log(`Processing ${rows.length} global rows...`);

  for (const row of rows) {
    try {
      const titleName = row.season_title || row.show_title;
      if (!titleName) continue;

      const type = CATEGORY_TYPE_MAP[row.category];
      if (!type) {
        result.errors.push(`Unknown category: ${row.category}`);
        continue;
      }

      const titleId = await findOrCreateTitle(titleName, type, titleCache);
      const { weekStart, weekEnd } = parseWeekRange(row.week);
      const runtimeHours = parseRuntimeHours(row.runtime);

      // Calculate views from hours if not provided
      const hoursViewed = row.weekly_hours_viewed || 0;
      const views = row.weekly_views ?? (runtimeHours ? hoursViewed / runtimeHours : 0);

      await prisma.netflixWeeklyGlobal.upsert({
        where: {
          titleId_weekStart_category: {
            titleId,
            weekStart,
            category: row.category,
          },
        },
        create: {
          titleId,
          weekStart,
          weekEnd,
          category: row.category,
          rank: row.weekly_rank,
          views,
          hoursViewed,
          runtimeHours,
        },
        update: {
          weekEnd,
          rank: row.weekly_rank,
          views,
          hoursViewed,
          runtimeHours,
        },
      });

      result.globalRecordsUpserted++;
      result.globalRowsProcessed++;
    } catch (error) {
      result.errors.push(`Global row error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Process US country data
 */
async function processUSData(
  rows: CountryRow[],
  titleCache: Map<string, { id: string; canonicalName: string; aliases: string[] | null }>,
  result: IngestResult
): Promise<void> {
  // Filter to US only
  const usRows = rows.filter(
    (row) => row.country_iso2 === 'US' || row.country_name === 'United States'
  );
  console.log(`Processing ${usRows.length} US rows (filtered from ${rows.length})...`);

  for (const row of usRows) {
    try {
      const titleName = row.season_title || row.show_title;
      if (!titleName) continue;

      const type = CATEGORY_TYPE_MAP[row.category];
      if (!type) {
        result.errors.push(`Unknown category: ${row.category}`);
        continue;
      }

      const titleId = await findOrCreateTitle(titleName, type, titleCache);
      const { weekStart, weekEnd } = parseWeekRange(row.week);

      await prisma.netflixWeeklyUS.upsert({
        where: {
          titleId_weekStart_category: {
            titleId,
            weekStart,
            category: row.category,
          },
        },
        create: {
          titleId,
          weekStart,
          weekEnd,
          category: row.category,
          rank: row.weekly_rank,
        },
        update: {
          weekEnd,
          rank: row.weekly_rank,
        },
      });

      result.usRecordsUpserted++;
      result.usRowsProcessed++;
    } catch (error) {
      result.errors.push(`US row error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Main ingestion function
 */
export async function ingestNetflixWeekly(): Promise<IngestResult> {
  const result: IngestResult = {
    globalRowsProcessed: 0,
    usRowsProcessed: 0,
    titlesCreated: 0,
    titlesUpdated: 0,
    globalRecordsUpserted: 0,
    usRecordsUpserted: 0,
    errors: [],
  };

  // Title cache for deduplication
  const titleCache = new Map<
    string,
    { id: string; canonicalName: string; aliases: string[] | null }
  >();

  // Pre-load existing titles into cache
  const existingTitles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, type: true, aliases: true },
  });

  for (const title of existingTitles) {
    const normalized = normalizeTitle(title.canonicalName, title.type);
    titleCache.set(normalized.titleKey, {
      id: title.id,
      canonicalName: title.canonicalName,
      aliases: title.aliases as string[] | null,
    });
  }

  const initialTitleCount = titleCache.size;

  try {
    // Download and process global data
    const globalRows = await downloadAndParseXLSX<GlobalRow>(NETFLIX_GLOBAL_URL);
    await processGlobalData(globalRows, titleCache, result);

    // Download and process US data
    const countryRows = await downloadAndParseXLSX<CountryRow>(NETFLIX_COUNTRIES_URL);
    await processUSData(countryRows, titleCache, result);

    // Calculate title stats
    const finalTitleCount = await prisma.title.count();
    result.titlesCreated = finalTitleCount - initialTitleCount;
    result.titlesUpdated = titleCache.size - result.titlesCreated;
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  return result;
}

/**
 * Run job with logging
 */
export async function runIngestJob(): Promise<void> {
  const startTime = Date.now();

  // Create job run record
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ingest_netflix_weekly',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting Netflix weekly data ingestion...');
    const result = await ingestNetflixWeekly();

    const duration = Date.now() - startTime;
    console.log(`Ingestion complete in ${duration}ms`);
    console.log(`Global rows: ${result.globalRowsProcessed}`);
    console.log(`US rows: ${result.usRowsProcessed}`);
    console.log(`Titles created: ${result.titlesCreated}`);
    console.log(`Global records upserted: ${result.globalRecordsUpserted}`);
    console.log(`US records upserted: ${result.usRecordsUpserted}`);

    if (result.errors.length > 0) {
      console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 10));
    }

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          ...result,
          errors: result.errors.slice(0, 100), // Limit stored errors
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Ingestion failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        detailsJson: { durationMs: duration },
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly
if (require.main === module) {
  runIngestJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
