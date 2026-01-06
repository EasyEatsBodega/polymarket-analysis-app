/**
 * TMDB (The Movie Database) API Client
 *
 * Used to discover upcoming Netflix releases and enrich title metadata.
 * API Documentation: https://developer.themoviedb.org/docs
 */

import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const NETFLIX_PROVIDER_ID = 8; // Netflix's watch provider ID in TMDB

interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
}

interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
}

interface TMDBDiscoverResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

interface TMDBWatchProviders {
  id: number;
  results: {
    US?: {
      flatrate?: Array<{ provider_id: number; provider_name: string }>;
    };
  };
}

export interface NetflixRelease {
  tmdbId: number;
  name: string;
  type: 'SHOW' | 'MOVIE';
  releaseDate: string | null;
  overview: string;
  posterPath: string | null;
  popularity: number;
  voteAverage: number;
}

function getApiKey(): string {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Get upcoming movies on Netflix US
 */
export async function discoverNetflixMovies(options: {
  releaseDateGte?: string;
  releaseDateLte?: string;
  page?: number;
} = {}): Promise<NetflixRelease[]> {
  const apiKey = getApiKey();
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const {
    releaseDateGte = today,
    releaseDateLte = futureDate,
    page = 1,
  } = options;

  const response = await axios.get<TMDBDiscoverResponse<TMDBMovie>>(
    `${TMDB_BASE_URL}/discover/movie`,
    {
      params: {
        api_key: apiKey,
        watch_region: 'US',
        with_watch_providers: NETFLIX_PROVIDER_ID,
        'primary_release_date.gte': releaseDateGte,
        'primary_release_date.lte': releaseDateLte,
        sort_by: 'popularity.desc',
        page,
      },
      timeout: 15000,
    }
  );

  return response.data.results.map((movie) => ({
    tmdbId: movie.id,
    name: movie.title,
    type: 'MOVIE' as const,
    releaseDate: movie.release_date || null,
    overview: movie.overview,
    posterPath: movie.poster_path,
    popularity: movie.popularity,
    voteAverage: movie.vote_average,
  }));
}

/**
 * Get upcoming TV shows on Netflix US
 */
export async function discoverNetflixShows(options: {
  firstAirDateGte?: string;
  firstAirDateLte?: string;
  page?: number;
} = {}): Promise<NetflixRelease[]> {
  const apiKey = getApiKey();
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const {
    firstAirDateGte = today,
    firstAirDateLte = futureDate,
    page = 1,
  } = options;

  const response = await axios.get<TMDBDiscoverResponse<TMDBTVShow>>(
    `${TMDB_BASE_URL}/discover/tv`,
    {
      params: {
        api_key: apiKey,
        watch_region: 'US',
        with_watch_providers: NETFLIX_PROVIDER_ID,
        'first_air_date.gte': firstAirDateGte,
        'first_air_date.lte': firstAirDateLte,
        sort_by: 'popularity.desc',
        page,
      },
      timeout: 15000,
    }
  );

  return response.data.results.map((show) => ({
    tmdbId: show.id,
    name: show.name,
    type: 'SHOW' as const,
    releaseDate: show.first_air_date || null,
    overview: show.overview,
    posterPath: show.poster_path,
    popularity: show.popularity,
    voteAverage: show.vote_average,
  }));
}

/**
 * Get recently released content on Netflix (last 30 days)
 * Useful for catching new releases that may hit Top 10
 */
export async function discoverRecentNetflixReleases(): Promise<NetflixRelease[]> {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [movies, shows] = await Promise.all([
    discoverNetflixMovies({
      releaseDateGte: thirtyDaysAgo,
      releaseDateLte: today,
    }),
    discoverNetflixShows({
      firstAirDateGte: thirtyDaysAgo,
      firstAirDateLte: today,
    }),
  ]);

  return [...movies, ...shows].sort((a, b) => b.popularity - a.popularity);
}

/**
 * Get upcoming Netflix releases (next 90 days)
 */
export async function discoverUpcomingNetflixReleases(): Promise<NetflixRelease[]> {
  const today = new Date().toISOString().split('T')[0];
  const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [movies, shows] = await Promise.all([
    discoverNetflixMovies({
      releaseDateGte: today,
      releaseDateLte: ninetyDaysFromNow,
    }),
    discoverNetflixShows({
      firstAirDateGte: today,
      firstAirDateLte: ninetyDaysFromNow,
    }),
  ]);

  return [...movies, ...shows].sort((a, b) => {
    // Sort by release date, then by popularity
    if (a.releaseDate && b.releaseDate) {
      const dateCompare = a.releaseDate.localeCompare(b.releaseDate);
      if (dateCompare !== 0) return dateCompare;
    }
    return b.popularity - a.popularity;
  });
}

/**
 * Check if a specific title is available on Netflix
 */
export async function checkNetflixAvailability(
  tmdbId: number,
  type: 'movie' | 'tv'
): Promise<boolean> {
  const apiKey = getApiKey();

  try {
    const response = await axios.get<TMDBWatchProviders>(
      `${TMDB_BASE_URL}/${type}/${tmdbId}/watch/providers`,
      {
        params: { api_key: apiKey },
        timeout: 10000,
      }
    );

    const usProviders = response.data.results?.US?.flatrate || [];
    return usProviders.some((p) => p.provider_id === NETFLIX_PROVIDER_ID);
  } catch {
    return false;
  }
}

/**
 * Search TMDB for a title by name
 */
export async function searchTMDB(
  query: string,
  type: 'movie' | 'tv'
): Promise<NetflixRelease[]> {
  const apiKey = getApiKey();

  const response = await axios.get<TMDBDiscoverResponse<TMDBMovie | TMDBTVShow>>(
    `${TMDB_BASE_URL}/search/${type}`,
    {
      params: {
        api_key: apiKey,
        query,
        include_adult: false,
      },
      timeout: 10000,
    }
  );

  return response.data.results.map((item) => {
    const isMovie = 'title' in item;
    return {
      tmdbId: item.id,
      name: isMovie ? (item as TMDBMovie).title : (item as TMDBTVShow).name,
      type: isMovie ? ('MOVIE' as const) : ('SHOW' as const),
      releaseDate: isMovie
        ? (item as TMDBMovie).release_date || null
        : (item as TMDBTVShow).first_air_date || null,
      overview: item.overview,
      posterPath: item.poster_path,
      popularity: item.popularity,
      voteAverage: item.vote_average,
    };
  });
}

/**
 * Get full poster URL from poster path
 */
export function getPosterUrl(posterPath: string | null, size: 'w185' | 'w342' | 'w500' | 'original' = 'w342'): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}
