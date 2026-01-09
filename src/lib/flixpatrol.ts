/**
 * FlixPatrol Service
 *
 * Fetches and manages FlixPatrol data for titles including:
 * - Historical rankings and points
 * - Regional performance breakdown
 * - Trailer statistics
 * - Social media metrics
 */

import axios, { AxiosInstance } from 'axios';

const FLIXPATROL_API_BASE = 'https://api.flixpatrol.com/v2';

export interface FlixPatrolTitle {
  id: string;
  title: string;
  imdbId: number;
  tmdbId: number;
  link: string;
  description?: string;
  premiere?: string;
  premiereOnline?: string;
  budget?: number;
  socialLinks: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    reddit?: string;
    wikipedia?: string;
  };
}

export interface FlixPatrolRanking {
  date: string;
  rank: number;
  points: number;
  country: string;
  days?: number;
  daysTotal?: number;
}

export interface FlixPatrolTrailer {
  id: string;
  title: string;
  premiere: string;
  views: number;
  likes: number;
  dislikes: number;
  engagementRatio: number; // likes / (likes + dislikes) * 100
}

export interface FlixPatrolRegionalSummary {
  country: string;
  countryName: string;
  totalPoints: number;
  peakRank: number;
  daysInTop10: number;
  latestRank: number | null;
  latestDate: string | null;
}

export interface FlixPatrolPerformance {
  totalPoints: number;
  peakRank: number;
  daysInTop10: number;
  countriesReached: number;
  averageRank: number;
  firstAppearance: string | null;
  lastAppearance: string | null;
}

export interface FlixPatrolTitleData {
  title: FlixPatrolTitle | null;
  performance: FlixPatrolPerformance;
  regionalBreakdown: FlixPatrolRegionalSummary[];
  rankHistory: FlixPatrolRanking[];
  trailers: FlixPatrolTrailer[];
}

// Country ID to name mapping (common ones)
const COUNTRY_NAMES: Record<string, string> = {
  world: 'Global',
  us: 'United States',
  uk: 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  fr: 'France',
  br: 'Brazil',
  mx: 'Mexico',
  jp: 'Japan',
  kr: 'South Korea',
  in: 'India',
  es: 'Spain',
  it: 'Italy',
  nl: 'Netherlands',
  se: 'Sweden',
  no: 'Norway',
  dk: 'Denmark',
  fi: 'Finland',
  pl: 'Poland',
  ar: 'Argentina',
  co: 'Colombia',
  cl: 'Chile',
  pe: 'Peru',
  ph: 'Philippines',
  id: 'Indonesia',
  th: 'Thailand',
  vn: 'Vietnam',
  sg: 'Singapore',
  my: 'Malaysia',
  za: 'South Africa',
  ng: 'Nigeria',
  eg: 'Egypt',
  ae: 'UAE',
  sa: 'Saudi Arabia',
  tr: 'Turkey',
  ru: 'Russia',
  ua: 'Ukraine',
  cz: 'Czech Republic',
  hu: 'Hungary',
  ro: 'Romania',
  gr: 'Greece',
  pt: 'Portugal',
  be: 'Belgium',
  at: 'Austria',
  ch: 'Switzerland',
  ie: 'Ireland',
  nz: 'New Zealand',
  il: 'Israel',
  hk: 'Hong Kong',
  tw: 'Taiwan',
};

function createApiClient(): AxiosInstance | null {
  const apiKey = process.env.FLIXPATROL_API_KEY;
  if (!apiKey) {
    return null;
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
export async function searchFlixPatrolTitle(
  titleName: string
): Promise<FlixPatrolTitle | null> {
  const api = createApiClient();
  if (!api) return null;

  try {
    const response = await api.get('/titles', {
      params: { 'title[eq]': titleName },
    });

    if (response.data?.data?.[0]) {
      const t = response.data.data[0].data;
      return {
        id: t.id,
        title: t.title,
        imdbId: t.imdbId,
        tmdbId: t.tmdbId,
        link: t.link,
        description: t.description,
        premiere: t.premiere,
        premiereOnline: t.premiereOnline,
        budget: t.budget,
        socialLinks: {
          facebook: t.linkFacebook,
          twitter: t.linkTwitter,
          instagram: t.linkInstagram,
          reddit: t.linkReddit,
          wikipedia: t.linkWikipedia,
        },
      };
    }
    return null;
  } catch (error) {
    console.error('Error searching FlixPatrol title:', error);
    return null;
  }
}

/**
 * Get rankings data for a FlixPatrol title
 */
export async function getFlixPatrolRankings(
  fpTitleId: string,
  limit = 500
): Promise<FlixPatrolRanking[]> {
  const api = createApiClient();
  if (!api) return [];

  const rankings: FlixPatrolRanking[] = [];

  try {
    let nextUrl: string | null = `/rankings?movie[eq]=${fpTitleId}`;

    while (nextUrl && rankings.length < limit) {
      const response = await api.get(nextUrl);

      if (response.data?.data) {
        for (const item of response.data.data) {
          const d = item.data;
          rankings.push({
            date: d.date?.from || d.date,
            rank: d.ranking,
            points: d.value,
            country: d.country?.data?.id || 'world',
            days: d.days,
            daysTotal: d.daysTotal,
          });
        }
      }

      nextUrl = response.data?.links?.next
        ? response.data.links.next.replace(FLIXPATROL_API_BASE, '')
        : null;
    }
  } catch (error) {
    console.error('Error fetching FlixPatrol rankings:', error);
  }

  return rankings;
}

/**
 * Get trailer data for a FlixPatrol title
 */
export async function getFlixPatrolTrailers(
  fpTitleId: string
): Promise<FlixPatrolTrailer[]> {
  const api = createApiClient();
  if (!api) return [];

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
          title: d.title,
          premiere: d.premiere,
          views: d.views || 0,
          likes,
          dislikes,
          engagementRatio: total > 0 ? Math.round((likes / total) * 100) : 0,
        };
      });
    }
    return [];
  } catch (error) {
    console.error('Error fetching FlixPatrol trailers:', error);
    return [];
  }
}

/**
 * Process rankings into regional summary
 */
export function processRegionalBreakdown(
  rankings: FlixPatrolRanking[]
): FlixPatrolRegionalSummary[] {
  const byCountry = new Map<
    string,
    {
      points: number;
      peakRank: number;
      days: number;
      latestRank: number | null;
      latestDate: string | null;
    }
  >();

  for (const r of rankings) {
    const existing = byCountry.get(r.country);
    if (existing) {
      existing.points += r.points;
      existing.peakRank = Math.min(existing.peakRank, r.rank);
      existing.days += r.days || 1;
      if (!existing.latestDate || r.date > existing.latestDate) {
        existing.latestDate = r.date;
        existing.latestRank = r.rank;
      }
    } else {
      byCountry.set(r.country, {
        points: r.points,
        peakRank: r.rank,
        days: r.days || 1,
        latestRank: r.rank,
        latestDate: r.date,
      });
    }
  }

  return Array.from(byCountry.entries())
    .map(([country, data]) => ({
      country,
      countryName: COUNTRY_NAMES[country] || country,
      totalPoints: data.points,
      peakRank: data.peakRank,
      daysInTop10: data.days,
      latestRank: data.latestRank,
      latestDate: data.latestDate,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/**
 * Calculate overall performance metrics
 */
export function calculatePerformance(
  rankings: FlixPatrolRanking[]
): FlixPatrolPerformance {
  if (rankings.length === 0) {
    return {
      totalPoints: 0,
      peakRank: 0,
      daysInTop10: 0,
      countriesReached: 0,
      averageRank: 0,
      firstAppearance: null,
      lastAppearance: null,
    };
  }

  const totalPoints = rankings.reduce((sum, r) => sum + r.points, 0);
  const peakRank = Math.min(...rankings.map((r) => r.rank));
  const daysInTop10 = rankings.reduce((sum, r) => sum + (r.days || 1), 0);
  const uniqueCountries = new Set(rankings.map((r) => r.country));
  const averageRank = rankings.reduce((sum, r) => sum + r.rank, 0) / rankings.length;

  const dates = rankings.map((r) => r.date).sort();
  const firstAppearance = dates[0] || null;
  const lastAppearance = dates[dates.length - 1] || null;

  return {
    totalPoints,
    peakRank,
    daysInTop10,
    countriesReached: uniqueCountries.size,
    averageRank: Math.round(averageRank * 10) / 10,
    firstAppearance,
    lastAppearance,
  };
}

/**
 * Get complete FlixPatrol data for a title
 */
export async function getFlixPatrolTitleData(
  titleName: string
): Promise<FlixPatrolTitleData> {
  // Search for title
  const title = await searchFlixPatrolTitle(titleName);

  if (!title) {
    return {
      title: null,
      performance: {
        totalPoints: 0,
        peakRank: 0,
        daysInTop10: 0,
        countriesReached: 0,
        averageRank: 0,
        firstAppearance: null,
        lastAppearance: null,
      },
      regionalBreakdown: [],
      rankHistory: [],
      trailers: [],
    };
  }

  // Fetch rankings and trailers in parallel
  const [rankings, trailers] = await Promise.all([
    getFlixPatrolRankings(title.id),
    getFlixPatrolTrailers(title.id),
  ]);

  // Process data
  const performance = calculatePerformance(rankings);
  const regionalBreakdown = processRegionalBreakdown(rankings);

  // Sort rankings by date for history chart
  const rankHistory = rankings
    .filter((r) => r.country === 'world' || r.country.startsWith('cnt_'))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    title,
    performance,
    regionalBreakdown,
    rankHistory,
    trailers,
  };
}
