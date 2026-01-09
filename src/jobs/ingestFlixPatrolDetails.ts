/**
 * FlixPatrol Details Ingestion Job
 *
 * Fetches trailer and social data for Polymarket-linked titles.
 * Runs every 48 hours to track day-over-day changes.
 *
 * Data collected:
 * - Trailer stats: views, likes, dislikes, engagement ratio
 * - Social followers: Facebook, Twitter, Instagram, Reddit
 */

import axios, { AxiosInstance } from 'axios';
import prisma from '../lib/prisma';

const FLIXPATROL_API_BASE = 'https://api.flixpatrol.com/v2';

interface IngestResult {
  titlesProcessed: number;
  trailersIngested: number;
  socialIngested: number;
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
 * Search for a title in FlixPatrol by name
 */
async function findFlixPatrolTitle(
  api: AxiosInstance,
  titleName: string
): Promise<string | null> {
  try {
    // Try exact match first
    let response = await api.get('/titles', {
      params: { 'title[eq]': titleName },
    });

    if (response.data?.data?.[0]) {
      return response.data.data[0].data.id;
    }

    // Try without season suffix (e.g., "Stranger Things: Season 5" -> "Stranger Things")
    const baseName = titleName.replace(/:\s*Season\s*\d+/i, '').trim();
    if (baseName !== titleName) {
      response = await api.get('/titles', {
        params: { 'title[eq]': baseName },
      });

      if (response.data?.data?.[0]) {
        return response.data.data[0].data.id;
      }
    }

    // Try variations
    const variations = [
      titleName.replace(/&/g, 'and'),
      titleName.replace(/and/gi, '&'),
      titleName.split(':')[0].trim(),
    ];

    for (const variation of variations) {
      if (variation === titleName || variation === baseName) continue;

      response = await api.get('/titles', {
        params: { 'title[eq]': variation },
      });

      if (response.data?.data?.[0]) {
        return response.data.data[0].data.id;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error searching for "${titleName}":`, error);
    return null;
  }
}

/**
 * Fetch trailer data for a FlixPatrol title
 */
async function fetchTrailers(
  api: AxiosInstance,
  fpTitleId: string
): Promise<
  Array<{
    id: string;
    title: string;
    premiere: string | null;
    views: number;
    likes: number;
    dislikes: number;
    engagementRatio: number;
  }>
> {
  try {
    const response = await api.get('/trailers', {
      params: { 'movie[eq]': fpTitleId },
    });

    if (response.data?.data) {
      return response.data.data.map((item: any) => {
        const d = item.data;
        const likes = d.likes || 0;
        const dislikes = d.dislikes || 0;
        const total = likes + dislikes;

        return {
          id: d.id,
          title: d.title || 'Untitled',
          premiere: d.premiere || null,
          views: d.views || 0,
          likes,
          dislikes,
          engagementRatio: total > 0 ? Math.round((likes / total) * 100) : 0,
        };
      });
    }
    return [];
  } catch (error) {
    console.error(`Error fetching trailers for ${fpTitleId}:`, error);
    return [];
  }
}

/**
 * Fetch social/fans data for a FlixPatrol title
 */
async function fetchSocial(
  api: AxiosInstance,
  fpTitleId: string
): Promise<
  Array<{
    platform: string;
    followers: number;
    change: number;
  }>
> {
  try {
    const response = await api.get('/fans', {
      params: { 'movie[eq]': fpTitleId },
    });

    if (response.data?.data) {
      // Group by platform (company) and get latest value
      const byPlatform = new Map<string, { followers: number; change: number }>();

      for (const item of response.data.data) {
        const d = item.data;
        // Extract platform from company or note
        const platform = extractPlatform(d);
        if (!platform) continue;

        const existing = byPlatform.get(platform);
        const followers = d.valueTotal || d.value || 0;
        const change = d.value || 0;

        // Keep the one with higher followers (most recent/complete)
        if (!existing || followers > existing.followers) {
          byPlatform.set(platform, { followers, change });
        }
      }

      return Array.from(byPlatform.entries()).map(([platform, data]) => ({
        platform,
        followers: data.followers,
        change: data.change,
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching social for ${fpTitleId}:`, error);
    return [];
  }
}

/**
 * Extract platform name from fan data
 */
function extractPlatform(data: any): string | null {
  const note = (data.note || '').toLowerCase();
  const companyId = data.company?.data?.id || '';

  if (note.includes('facebook') || note.includes('fb')) return 'facebook';
  if (note.includes('twitter') || note.includes('@')) return 'twitter';
  if (note.includes('instagram') || note.includes('ig')) return 'instagram';
  if (note.includes('reddit') || note.includes('/r/')) return 'reddit';
  if (note.includes('youtube')) return 'youtube';
  if (note.includes('tiktok')) return 'tiktok';

  // Fallback to company ID pattern
  if (companyId.includes('facebook')) return 'facebook';
  if (companyId.includes('twitter')) return 'twitter';
  if (companyId.includes('instagram')) return 'instagram';

  return null;
}

/**
 * Main ingestion function
 */
export async function ingestFlixPatrolDetails(): Promise<IngestResult> {
  const result: IngestResult = {
    titlesProcessed: 0,
    trailersIngested: 0,
    socialIngested: 0,
    apiCallsUsed: 0,
    errors: [],
  };

  const api = createApiClient();
  const now = new Date();
  // Round to start of day for fetchedAt comparison
  now.setUTCHours(0, 0, 0, 0);

  // Get all Polymarket-linked titles
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } },
    },
    select: { id: true, canonicalName: true },
  });

  console.log(`Processing ${polymarketTitles.length} Polymarket titles...`);

  for (const title of polymarketTitles) {
    console.log(`\n[${result.titlesProcessed + 1}/${polymarketTitles.length}] ${title.canonicalName}`);

    // Find FlixPatrol title ID
    const fpTitleId = await findFlixPatrolTitle(api, title.canonicalName);
    result.apiCallsUsed++;

    if (!fpTitleId) {
      console.log('  → Not found in FlixPatrol');
      result.titlesProcessed++;
      continue;
    }

    console.log(`  → Found: ${fpTitleId}`);

    // Fetch trailers
    const trailers = await fetchTrailers(api, fpTitleId);
    result.apiCallsUsed++;

    if (trailers.length > 0) {
      console.log(`  → ${trailers.length} trailers found`);

      for (const trailer of trailers) {
        try {
          await prisma.flixPatrolTrailer.upsert({
            where: {
              titleId_fpTrailerId_fetchedAt: {
                titleId: title.id,
                fpTrailerId: trailer.id,
                fetchedAt: now,
              },
            },
            create: {
              titleId: title.id,
              fpTrailerId: trailer.id,
              trailerTitle: trailer.title,
              premiereDate: trailer.premiere ? new Date(trailer.premiere) : null,
              views: trailer.views,
              likes: trailer.likes,
              dislikes: trailer.dislikes,
              engagementRatio: trailer.engagementRatio,
              fetchedAt: now,
            },
            update: {
              views: trailer.views,
              likes: trailer.likes,
              dislikes: trailer.dislikes,
              engagementRatio: trailer.engagementRatio,
            },
          });
          result.trailersIngested++;
        } catch (error) {
          result.errors.push(`Trailer ${trailer.id}: ${error}`);
        }
      }
    }

    // Fetch social data
    const social = await fetchSocial(api, fpTitleId);
    result.apiCallsUsed++;

    if (social.length > 0) {
      console.log(`  → ${social.length} social platforms found`);

      for (const s of social) {
        try {
          await prisma.flixPatrolSocial.upsert({
            where: {
              titleId_platform_fetchedAt: {
                titleId: title.id,
                platform: s.platform,
                fetchedAt: now,
              },
            },
            create: {
              titleId: title.id,
              platform: s.platform,
              followers: s.followers,
              change: s.change,
              fetchedAt: now,
            },
            update: {
              followers: s.followers,
              change: s.change,
            },
          });
          result.socialIngested++;
        } catch (error) {
          result.errors.push(`Social ${s.platform}: ${error}`);
        }
      }
    }

    result.titlesProcessed++;

    // Rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  return result;
}

// CLI execution
if (require.main === module) {
  console.log('FlixPatrol Details Ingestion');
  console.log('============================\n');

  ingestFlixPatrolDetails()
    .then((result) => {
      console.log('\n============================');
      console.log('Ingestion Complete!');
      console.log(`  Titles processed: ${result.titlesProcessed}`);
      console.log(`  Trailers ingested: ${result.trailersIngested}`);
      console.log(`  Social records: ${result.socialIngested}`);
      console.log(`  API calls used: ${result.apiCallsUsed}`);

      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error('Ingestion failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
