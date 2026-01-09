/**
 * OMDB API Integration
 *
 * Fetches IMDB ratings and Rotten Tomatoes scores
 * Free tier: 1,000 requests/day
 *
 * Get your API key at: https://www.omdbapi.com/apikey.aspx
 */

export interface OMDBRatings {
  imdbRating: number | null;
  imdbVotes: number | null;
  rtCriticScore: number | null;
  rtAudienceScore: number | null;
  metascore: number | null;
  rated: string | null;
  runtime: string | null;
  genre: string | null;
  director: string | null;
  actors: string | null;
  plot: string | null;
  awards: string | null;
  poster: string | null;
  imdbId: string | null;
}

interface OMDBResponse {
  Response: 'True' | 'False';
  Error?: string;
  Title?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Poster?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  Metascore?: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Type?: string;
  totalSeasons?: string;
}

/**
 * Search OMDB by title name
 */
export async function searchOMDB(
  title: string,
  type?: 'movie' | 'series',
  year?: number
): Promise<OMDBRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;

  if (!apiKey) {
    console.warn('OMDB_API_KEY not configured');
    return null;
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    t: title,
    plot: 'short',
  });

  if (type) params.append('type', type);
  if (year) params.append('y', year.toString());

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`);
    const data: OMDBResponse = await response.json();

    if (data.Response === 'False') {
      console.log(`OMDB: No results for "${title}" - ${data.Error}`);
      return null;
    }

    return parseOMDBResponse(data);
  } catch (error) {
    console.error('OMDB API error:', error);
    return null;
  }
}

/**
 * Fetch OMDB by IMDB ID (more accurate)
 */
export async function fetchByIMDBId(imdbId: string): Promise<OMDBRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;

  if (!apiKey) {
    console.warn('OMDB_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://www.omdbapi.com/?apikey=${apiKey}&i=${imdbId}&plot=short`
    );
    const data: OMDBResponse = await response.json();

    if (data.Response === 'False') {
      console.log(`OMDB: No results for IMDB ID "${imdbId}"`);
      return null;
    }

    return parseOMDBResponse(data);
  } catch (error) {
    console.error('OMDB API error:', error);
    return null;
  }
}

/**
 * Parse OMDB response into our ratings format
 */
function parseOMDBResponse(data: OMDBResponse): OMDBRatings {
  // Parse IMDB rating (e.g., "8.5" -> 8.5)
  const imdbRating = data.imdbRating && data.imdbRating !== 'N/A'
    ? parseFloat(data.imdbRating)
    : null;

  // Parse IMDB votes (e.g., "1,234,567" -> 1234567)
  const imdbVotes = data.imdbVotes && data.imdbVotes !== 'N/A'
    ? parseInt(data.imdbVotes.replace(/,/g, ''), 10)
    : null;

  // Parse Metascore (e.g., "75" -> 75)
  const metascore = data.Metascore && data.Metascore !== 'N/A'
    ? parseInt(data.Metascore, 10)
    : null;

  // Extract Rotten Tomatoes scores from Ratings array
  let rtCriticScore: number | null = null;
  let rtAudienceScore: number | null = null;

  if (data.Ratings) {
    for (const rating of data.Ratings) {
      if (rating.Source === 'Rotten Tomatoes') {
        // e.g., "85%" -> 85
        rtCriticScore = parseInt(rating.Value.replace('%', ''), 10);
      }
    }
  }

  // Note: OMDB doesn't provide RT Audience Score directly
  // We'd need to scrape RT for that (not recommended)

  return {
    imdbRating,
    imdbVotes,
    rtCriticScore,
    rtAudienceScore, // Will be null from OMDB
    metascore,
    rated: data.Rated !== 'N/A' ? data.Rated ?? null : null,
    runtime: data.Runtime !== 'N/A' ? data.Runtime ?? null : null,
    genre: data.Genre !== 'N/A' ? data.Genre ?? null : null,
    director: data.Director !== 'N/A' ? data.Director ?? null : null,
    actors: data.Actors !== 'N/A' ? data.Actors ?? null : null,
    plot: data.Plot !== 'N/A' ? data.Plot ?? null : null,
    awards: data.Awards !== 'N/A' ? data.Awards ?? null : null,
    poster: data.Poster !== 'N/A' ? data.Poster ?? null : null,
    imdbId: data.imdbID ?? null,
  };
}

/**
 * Clean title for better OMDB matching
 * Removes common suffixes like ": Season 1", "(Limited Series)", etc.
 */
export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/:\s*Season\s*\d+/i, '')
    .replace(/:\s*Series\s*\d+/i, '')
    .replace(/\s*\(Limited Series\)/i, '')
    .replace(/\s*\(Miniseries\)/i, '')
    .replace(/\s*\(\d{4}\)/i, '') // Remove year in parentheses
    .trim();
}
