/**
 * Polymarket Market Cache
 *
 * Persistent database cache for discovered Polymarket Netflix market slugs.
 * Avoids expensive market ID scanning on every request.
 *
 * Two-tier caching:
 * 1. Full cache (6 hours) - complete market data for fast responses
 * 2. Last known IDs (never expires) - hints for faster cold start scanning
 */

import prisma from './prisma';

const CACHE_KEY = 'polymarket_netflix_markets';
const LAST_IDS_KEY = 'polymarket_last_known_ids';
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

// Last known IDs for each pattern - used as hints for faster scanning
interface LastKnownIds {
  [pattern: string]: number;
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
  } catch {
    // Ignore if not found
  }
}

/**
 * Get last known market IDs (never expires - used as hints for faster scanning)
 */
export async function getLastKnownIds(): Promise<LastKnownIds> {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { key: LAST_IDS_KEY },
    });

    if (!config) return {};

    return config.value as LastKnownIds;
  } catch (error) {
    console.error('[marketCache] Error reading last known IDs:', error);
    return {};
  }
}

/**
 * Save last known market IDs (for faster future scanning)
 */
export async function setLastKnownIds(ids: LastKnownIds): Promise<void> {
  try {
    await prisma.appConfig.upsert({
      where: { key: LAST_IDS_KEY },
      update: { value: ids },
      create: { key: LAST_IDS_KEY, value: ids },
    });
    console.log('[marketCache] Saved last known IDs for', Object.keys(ids).length, 'patterns');
  } catch (error) {
    console.error('[marketCache] Error saving last known IDs:', error);
  }
}

/**
 * Update last known IDs from discovered markets
 */
export async function updateLastKnownIds(markets: CachedMarket[]): Promise<void> {
  const currentIds = await getLastKnownIds();

  for (const market of markets) {
    // Only update if this ID is higher than what we knew before
    if (!currentIds[market.pattern] || market.id > currentIds[market.pattern]) {
      currentIds[market.pattern] = market.id;
    }
  }

  await setLastKnownIds(currentIds);
}
