/**
 * Active Polymarket Markets Utility
 *
 * Fetches and filters for titles that are currently active options
 * on Polymarket for this week's markets.
 */

import axios from 'axios';

interface ParsedOutcome {
  name: string;
  probability: number;
  volume: number;
}

interface ParsedMarket {
  slug: string;
  label: string;
  question: string;
  category: string;
  rank: number;
  outcomes: ParsedOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

interface PolymarketNetflixResponse {
  success: boolean;
  data: Record<string, ParsedMarket[]>;
  meta?: {
    totalMarkets: number;
    fetchedAt: string;
  };
}

/**
 * Get all currently active title names from Polymarket markets
 */
export async function getActivePolymarketTitles(): Promise<Set<string>> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';

  try {
    const response = await axios.get<PolymarketNetflixResponse>(`${baseUrl}/api/polymarket-netflix`, {
      timeout: 30000,
    });

    if (!response.data.success) {
      console.error('Failed to fetch active Polymarket markets');
      return new Set();
    }

    const activeTitles = new Set<string>();

    // Iterate through all market categories
    for (const markets of Object.values(response.data.data)) {
      for (const market of markets) {
        for (const outcome of market.outcomes) {
          // Skip "Other" outcomes
          if (outcome.name.toLowerCase() === 'other') continue;
          activeTitles.add(outcome.name);
        }
      }
    }

    return activeTitles;
  } catch (error) {
    console.error('Error fetching active Polymarket titles:', error);
    return new Set();
  }
}

/**
 * Normalize title name for comparison
 * Handles variations like "Season 5" vs ": Season 5"
 */
export function normalizeTitle(name: string): string {
  return name
    .replace(/:\s*Season\s*\d+$/i, '')
    .replace(/:\s*Limited Series$/i, '')
    .replace(/\s*\(.*?\)\s*$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Check if a title is currently active on Polymarket
 */
export function isTitleActive(titleName: string, activeTitles: Set<string>): boolean {
  // Direct match
  if (activeTitles.has(titleName)) return true;

  // Normalized match
  const normalizedInput = normalizeTitle(titleName);
  for (const active of activeTitles) {
    if (normalizeTitle(active) === normalizedInput) return true;
  }

  return false;
}

/**
 * Get active market data with title details
 */
export async function getActiveMarketData(): Promise<{
  titles: Set<string>;
  markets: ParsedMarket[];
  meta?: { totalMarkets: number; fetchedAt: string };
}> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';

  try {
    const response = await axios.get<PolymarketNetflixResponse>(`${baseUrl}/api/polymarket-netflix`, {
      timeout: 30000,
    });

    if (!response.data.success) {
      return { titles: new Set(), markets: [] };
    }

    const titles = new Set<string>();
    const markets: ParsedMarket[] = [];

    for (const categoryMarkets of Object.values(response.data.data)) {
      for (const market of categoryMarkets) {
        markets.push(market);
        for (const outcome of market.outcomes) {
          if (outcome.name.toLowerCase() !== 'other') {
            titles.add(outcome.name);
          }
        }
      }
    }

    return {
      titles,
      markets,
      meta: response.data.meta,
    };
  } catch (error) {
    console.error('Error fetching active market data:', error);
    return { titles: new Set(), markets: [] };
  }
}
