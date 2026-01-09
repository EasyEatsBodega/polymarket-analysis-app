/**
 * Polymarket Market Cache
 *
 * Persistent database cache for discovered Polymarket Netflix market slugs.
 * Avoids expensive market ID scanning on every request.
 */

import prisma from './prisma';

const CACHE_KEY = 'polymarket_netflix_markets';
const CACHE_TTL_HOURS = 6; // Cache for 6 hours

interface CachedMarket {
  pattern: string;
  slug: string;
  id: number;
  closed: boolean;
  discoveredAt: string;
}

interface MarketCache {
  markets: CachedMarket[];
  updatedAt: string;
}

/**
 * Get cached market slugs from database
 */
export async function getCachedMarkets(): Promise<MarketCache | null> {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { key: CACHE_KEY },
    });

    if (!config) return null;

    const cache = config.value as MarketCache;

    // Check if cache is still valid
    const updatedAt = new Date(cache.updatedAt);
    const ageHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (ageHours > CACHE_TTL_HOURS) {
      console.log('[marketCache] Cache expired, age:', ageHours.toFixed(1), 'hours');
      return null;
    }

    return cache;
  } catch (error) {
    console.error('[marketCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Save discovered market slugs to database
 */
export async function setCachedMarkets(markets: CachedMarket[]): Promise<void> {
  try {
    const cache: MarketCache = {
      markets,
      updatedAt: new Date().toISOString(),
    };

    await prisma.appConfig.upsert({
      where: { key: CACHE_KEY },
      update: { value: cache },
      create: { key: CACHE_KEY, value: cache },
    });

    console.log('[marketCache] Saved', markets.length, 'markets to cache');
  } catch (error) {
    console.error('[marketCache] Error saving cache:', error);
  }
}

/**
 * Get a specific market slug from cache by pattern
 */
export function getMarketFromCache(
  cache: MarketCache,
  pattern: string
): CachedMarket | null {
  return cache.markets.find((m) => m.pattern === pattern) || null;
}

/**
 * Clear the market cache (useful for manual refresh)
 */
export async function clearMarketCache(): Promise<void> {
  try {
    await prisma.appConfig.delete({
      where: { key: CACHE_KEY },
    });
    console.log('[marketCache] Cache cleared');
  } catch (error) {
    // Ignore if not found
  }
}
