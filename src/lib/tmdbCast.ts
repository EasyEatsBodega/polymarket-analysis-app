/**
 * TMDB Cast & Crew Data
 *
 * Fetches cast/crew information and calculates "star power" scores
 * to help explain why prediction markets favor certain titles.
 */

import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function getApiKey(): string {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY environment variable is not set');
  }
  return apiKey;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
  popularity: number;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  popularity: number;
}

export interface TitleCredits {
  cast: CastMember[];
  crew: CrewMember[];
  starPowerScore: number;
  topStars: string[];
}

/**
 * Calculate star power score based on cast popularity
 * Higher score = more star power = more likely to chart
 *
 * Score interpretation:
 *   80+ = A-list ensemble (major stars)
 *   60-79 = Strong cast (recognizable names)
 *   40-59 = Moderate star power
 *   20-39 = Limited star power
 *   <20 = Unknown cast
 */
function calculateStarPowerScore(cast: CastMember[]): number {
  if (cast.length === 0) return 0;

  // Weight top-billed actors more heavily
  const weights = [1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0.1, 0.05, 0.05];

  let totalScore = 0;
  let totalWeight = 0;

  for (let i = 0; i < Math.min(cast.length, 10); i++) {
    const weight = weights[i] || 0.05;
    totalScore += cast[i].popularity * weight;
    totalWeight += weight;
  }

  // Normalize to 0-100 scale (TMDB popularity typically 0-200+)
  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  return Math.min(100, Math.round(avgScore));
}

/**
 * Get credits (cast & crew) for a movie
 */
export async function getMovieCredits(tmdbId: number): Promise<TitleCredits | null> {
  try {
    const apiKey = getApiKey();

    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/${tmdbId}/credits`,
      {
        params: { api_key: apiKey },
        timeout: 10000,
      }
    );

    const cast: CastMember[] = response.data.cast.slice(0, 15).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      popularity: c.popularity,
      order: c.order,
    }));

    const crew: CrewMember[] = response.data.crew
      .filter((c: any) => ['Director', 'Producer', 'Executive Producer', 'Writer', 'Screenplay'].includes(c.job))
      .slice(0, 10)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        popularity: c.popularity,
      }));

    const starPowerScore = calculateStarPowerScore(cast);
    const topStars = cast.filter((c) => c.popularity > 15).slice(0, 5).map((c) => c.name);

    return { cast, crew, starPowerScore, topStars };
  } catch (error) {
    console.error(`Failed to get movie credits for ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Get credits (cast & crew) for a TV show
 */
export async function getTVCredits(tmdbId: number): Promise<TitleCredits | null> {
  try {
    const apiKey = getApiKey();

    const response = await axios.get(
      `${TMDB_BASE_URL}/tv/${tmdbId}/aggregate_credits`,
      {
        params: { api_key: apiKey },
        timeout: 10000,
      }
    );

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const cast: CastMember[] = response.data.cast.slice(0, 15).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.roles?.[0]?.character || c.character || 'Unknown',
      profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      popularity: c.popularity,
      order: c.order,
    }));

    const crew: CrewMember[] = response.data.crew
      .filter((c: any) => {
        const jobs = c.jobs?.map((j: any) => j.job) || [c.job];
        return jobs.some((job: string) =>
          ['Creator', 'Executive Producer', 'Showrunner', 'Director', 'Writer'].includes(job)
        );
      })
      .slice(0, 10)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        job: c.jobs?.[0]?.job || c.job,
        department: c.department,
        popularity: c.popularity,
      }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const starPowerScore = calculateStarPowerScore(cast);
    const topStars = cast.filter((c) => c.popularity > 15).slice(0, 5).map((c) => c.name);

    return { cast, crew, starPowerScore, topStars };
  } catch (error) {
    console.error(`Failed to get TV credits for ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Get credits for a title (auto-detects movie vs TV)
 */
export async function getTitleCredits(
  tmdbId: number,
  type: 'MOVIE' | 'SHOW'
): Promise<TitleCredits | null> {
  return type === 'MOVIE' ? getMovieCredits(tmdbId) : getTVCredits(tmdbId);
}

/**
 * Search TMDB for a title and get credits
 */
export async function searchAndGetCredits(
  query: string,
  type: 'MOVIE' | 'SHOW'
): Promise<{ tmdbId: number; name: string; credits: TitleCredits } | null> {
  try {
    const apiKey = getApiKey();
    const searchType = type === 'MOVIE' ? 'movie' : 'tv';

    const response = await axios.get(
      `${TMDB_BASE_URL}/search/${searchType}`,
      {
        params: {
          api_key: apiKey,
          query,
          include_adult: false,
        },
        timeout: 10000,
      }
    );

    if (response.data.results.length === 0) return null;

    const match = response.data.results[0];
    const tmdbId = match.id;
    const name = type === 'MOVIE' ? match.title : match.name;

    const credits = await getTitleCredits(tmdbId, type);
    if (!credits) return null;

    return { tmdbId, name, credits };
  } catch (error) {
    console.error(`Failed to search and get credits for "${query}":`, error);
    return null;
  }
}
