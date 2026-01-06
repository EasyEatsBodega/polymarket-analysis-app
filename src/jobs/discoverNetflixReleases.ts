/**
 * Netflix Release Discovery Job
 *
 * Uses TMDB API to discover upcoming and recent Netflix releases.
 * Creates ReleaseCandidate records for tracking before they hit Top 10.
 */

import prisma from '@/lib/prisma';
import { TitleType } from '@prisma/client';
import {
  discoverUpcomingNetflixReleases,
  discoverRecentNetflixReleases,
  NetflixRelease,
  getPosterUrl,
} from '@/lib/tmdbClient';
import { normalizeTitle } from '@/lib/titleNormalize';

interface DiscoveryResult {
  upcomingFound: number;
  recentFound: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  titlesMatched: number;
  errors: string[];
}

/**
 * Try to match a release to an existing Title in the database
 */
async function matchToExistingTitle(
  name: string,
  type: TitleType
): Promise<string | null> {
  const normalized = normalizeTitle(name);

  // Try exact match first
  const exactMatch = await prisma.title.findFirst({
    where: {
      type,
      canonicalName: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (exactMatch) return exactMatch.id;

  // Try normalized match
  const titles = await prisma.title.findMany({
    where: { type },
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
 * Process a single Netflix release into a ReleaseCandidate
 */
async function processRelease(
  release: NetflixRelease,
  result: DiscoveryResult
): Promise<void> {
  const sourceId = `${release.type.toLowerCase()}-${release.tmdbId}`;
  const type: TitleType = release.type === 'MOVIE' ? 'MOVIE' : 'SHOW';

  try {
    // Check if candidate already exists
    const existing = await prisma.releaseCandidate.findUnique({
      where: {
        source_sourceId: {
          source: 'tmdb',
          sourceId,
        },
      },
    });

    // Try to match to existing title
    const titleId = await matchToExistingTitle(release.name, type);

    const metadata = {
      tmdbId: release.tmdbId,
      overview: release.overview,
      posterUrl: getPosterUrl(release.posterPath),
      popularity: release.popularity,
      voteAverage: release.voteAverage,
    };

    if (existing) {
      // Update existing candidate
      await prisma.releaseCandidate.update({
        where: { id: existing.id },
        data: {
          name: release.name,
          releaseDate: release.releaseDate ? new Date(release.releaseDate) : null,
          metadata,
          titleId: titleId || existing.titleId,
          status: titleId && !existing.titleId ? 'MATCHED' : existing.status,
        },
      });
      result.candidatesUpdated++;
      if (titleId && !existing.titleId) {
        result.titlesMatched++;
      }
    } else {
      // Create new candidate
      await prisma.releaseCandidate.create({
        data: {
          name: release.name,
          type,
          releaseDate: release.releaseDate ? new Date(release.releaseDate) : null,
          source: 'tmdb',
          sourceId,
          status: titleId ? 'MATCHED' : 'PENDING',
          titleId,
          metadata,
        },
      });
      result.candidatesCreated++;
      if (titleId) {
        result.titlesMatched++;
      }
    }

    console.log(
      `  ${release.type} "${release.name}" (${release.releaseDate || 'TBD'})${titleId ? ' [matched]' : ''}`
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`${release.name}: ${errMsg}`);
  }
}

/**
 * Main discovery function
 */
export async function discoverNetflixReleases(): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    upcomingFound: 0,
    recentFound: 0,
    candidatesCreated: 0,
    candidatesUpdated: 0,
    titlesMatched: 0,
    errors: [],
  };

  try {
    console.log('Discovering Netflix releases from TMDB...');

    // Fetch upcoming and recent releases in parallel
    const [upcoming, recent] = await Promise.all([
      discoverUpcomingNetflixReleases(),
      discoverRecentNetflixReleases(),
    ]);

    result.upcomingFound = upcoming.length;
    result.recentFound = recent.length;

    console.log(`Found ${upcoming.length} upcoming and ${recent.length} recent releases`);

    // Combine and dedupe by tmdbId
    const allReleases = new Map<string, NetflixRelease>();
    for (const release of [...upcoming, ...recent]) {
      const key = `${release.type}-${release.tmdbId}`;
      if (!allReleases.has(key)) {
        allReleases.set(key, release);
      }
    }

    console.log(`Processing ${allReleases.size} unique releases...`);

    // Process each release
    for (const release of allReleases.values()) {
      await processRelease(release, result);
    }

    console.log(
      `Discovery complete: ${result.candidatesCreated} created, ${result.candidatesUpdated} updated, ${result.titlesMatched} matched`
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Fatal error: ${errMsg}`);
    console.error('Netflix release discovery failed:', error);
  }

  return result;
}

/**
 * Auto-match pending candidates to newly created titles
 * Run this after Netflix data ingestion to link releases
 */
export async function matchPendingCandidates(): Promise<{
  matched: number;
  errors: string[];
}> {
  const result = { matched: 0, errors: [] as string[] };

  try {
    const pendingCandidates = await prisma.releaseCandidate.findMany({
      where: { status: 'PENDING' },
    });

    console.log(`Checking ${pendingCandidates.length} pending candidates for matches...`);

    for (const candidate of pendingCandidates) {
      const titleId = await matchToExistingTitle(candidate.name, candidate.type);

      if (titleId) {
        await prisma.releaseCandidate.update({
          where: { id: candidate.id },
          data: {
            titleId,
            status: 'MATCHED',
          },
        });
        result.matched++;
        console.log(`  Matched: "${candidate.name}" -> ${titleId}`);
      }
    }

    console.log(`Matched ${result.matched} pending candidates`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errMsg);
  }

  return result;
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  discoverNetflixReleases()
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
