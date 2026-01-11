/**
 * Polymarket Sync Job
 *
 * Discovers and syncs Polymarket markets related to Netflix content.
 * Fetches current prices and stores historical snapshots.
 */


import axios from 'axios';

import prisma from '@/lib/prisma';

// Polymarket API endpoints
const POLYMARKET_API_BASE = 'https://clob.polymarket.com';
const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com';

// Keywords for filtering Netflix-related markets
const NETFLIX_KEYWORDS = ['netflix', 'streaming', 'show', 'series', 'movie', 'film'];

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  markets: PolymarketMarket[];
  category?: string;
  endDate?: string;
  closed: boolean;
}

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  liquidity: string;
  endDate?: string;
  closed: boolean;
}

interface SyncResult {
  marketsDiscovered: number;
  marketsCreated: number;
  marketsUpdated: number;
  priceSnapshots: number;
  titleLinksCreated: number;
  titlesCreated: number;
  errors: string[];
}

// Our curated Netflix markets API response types
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

type PolymarketData = ParsedMarket[] | Record<string, ParsedMarket[]>;

interface PolymarketNetflixResponse {
  success: boolean;
  data: PolymarketData;
}

function flattenMarkets(data: PolymarketData): ParsedMarket[] {
  if (Array.isArray(data)) return data;
  return Object.values(data).flat();
}

/**
 * Determine title type from market category
 */
function getTitleTypeFromCategory(category: string): 'SHOW' | 'MOVIE' {
  const lowerCat = category.toLowerCase();
  if (lowerCat.includes('film') || lowerCat.includes('movie')) {
    return 'MOVIE';
  }
  return 'SHOW';
}

/**
 * Clean outcome name for title matching
 * Removes season suffixes for matching but keeps original for display
 */
function normalizeForMatching(name: string): string {
  return name
    .replace(/:\s*Season\s+\d+$/i, '')
    .replace(/\s*\(.*?\)\s*$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Sync titles from Polymarket outcomes to our database
 * Creates Title records for any outcomes that don't exist
 */
async function syncPolymarketTitles(result: SyncResult): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://predicteasy.vercel.app';

  try {
    // Fetch all Netflix markets from our curated API
    const response = await axios.get<PolymarketNetflixResponse>(`${baseUrl}/api/polymarket-netflix`, {
      timeout: 30000,
    });

    if (!response.data.success) {
      result.errors.push('Failed to fetch polymarket-netflix data');
      return;
    }

    const markets = flattenMarkets(response.data.data);
    console.log(`Processing ${markets.length} markets for title sync...`);

    // Get all existing titles
    const existingTitles = await prisma.title.findMany({
      select: { id: true, canonicalName: true, type: true, aliases: true },
    });

    // Build a map for fast lookup
    const titleMap = new Map<string, { id: string; canonicalName: string }>();
    for (const title of existingTitles) {
      const normalizedName = normalizeForMatching(title.canonicalName);
      titleMap.set(`${normalizedName}:${title.type}`, { id: title.id, canonicalName: title.canonicalName });

      // Also index by aliases
      if (title.aliases && Array.isArray(title.aliases)) {
        for (const alias of title.aliases as string[]) {
          const normalizedAlias = normalizeForMatching(alias);
          titleMap.set(`${normalizedAlias}:${title.type}`, { id: title.id, canonicalName: title.canonicalName });
        }
      }
    }

    // Track which outcomes we've processed to avoid duplicates
    const processedOutcomes = new Set<string>();

    for (const market of markets) {
      const titleType = getTitleTypeFromCategory(market.category);

      for (const outcome of market.outcomes) {
        // Skip "Other" outcomes
        if (outcome.name.toLowerCase() === 'other') continue;

        const normalizedName = normalizeForMatching(outcome.name);
        const key = `${normalizedName}:${titleType}`;

        // Skip if we already processed this outcome
        if (processedOutcomes.has(key)) continue;
        processedOutcomes.add(key);

        // Check if title already exists
        const existingTitle = titleMap.get(key);

        if (!existingTitle) {
          // Create new Title record
          try {
            const newTitle = await prisma.title.create({
              data: {
                canonicalName: outcome.name, // Keep original name with season
                type: titleType,
                aliases: [], // Can be populated later
              },
            });

            // Add to map for future lookups in this run
            titleMap.set(key, { id: newTitle.id, canonicalName: newTitle.canonicalName });

            // Also add external ID to track source
            await prisma.titleExternalId.create({
              data: {
                titleId: newTitle.id,
                provider: 'polymarket',
                externalId: outcome.name, // Use outcome name as identifier
              },
            });

            result.titlesCreated++;
            console.log(`Created title: ${outcome.name} (${titleType})`);
          } catch (error) {
            // Handle unique constraint violations (race conditions)
            if (error instanceof Error && error.message.includes('Unique constraint')) {
              // Title was created by another process, ignore
            } else {
              result.errors.push(`Failed to create title "${outcome.name}": ${error instanceof Error ? error.message : error}`);
            }
          }
        } else {
          // Title exists - ensure it has a Polymarket external ID
          try {
            const existingExtId = await prisma.titleExternalId.findUnique({
              where: {
                titleId_provider: {
                  titleId: existingTitle.id,
                  provider: 'polymarket',
                },
              },
            });

            if (!existingExtId) {
              await prisma.titleExternalId.create({
                data: {
                  titleId: existingTitle.id,
                  provider: 'polymarket',
                  externalId: outcome.name,
                },
              });
              console.log(`Linked existing title to Polymarket: ${existingTitle.canonicalName}`);
            }
          } catch (error) {
            // Ignore unique constraint violations (external ID exists with different externalId value)
            if (!(error instanceof Error && error.message.includes('Unique constraint'))) {
              result.errors.push(`Failed to link title "${existingTitle.canonicalName}": ${error instanceof Error ? error.message : error}`);
            }
          }
        }
      }
    }

    console.log(`Title sync complete: ${result.titlesCreated} new titles created`);
  } catch (error) {
    result.errors.push(`Error syncing Polymarket titles: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Search for Netflix-related events on Polymarket
 */
async function searchNetflixEvents(): Promise<PolymarketEvent[]> {
  const events: PolymarketEvent[] = [];

  try {
    // Search for events with Netflix-related keywords
    for (const keyword of ['netflix', 'streaming show', 'tv series']) {
      const response = await axios.get(`${POLYMARKET_GAMMA_API}/events`, {
        params: {
          limit: 50,
          closed: false,
          _q: keyword,
        },
        timeout: 10000,
      });

      if (response.data) {
        events.push(...response.data);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    }

    // Dedupe by event ID
    const uniqueEvents = new Map<string, PolymarketEvent>();
    for (const event of events) {
      if (!uniqueEvents.has(event.id)) {
        uniqueEvents.set(event.id, event);
      }
    }

    return Array.from(uniqueEvents.values());
  } catch (error) {
    console.error('Error searching Polymarket events:', error);
    return [];
  }
}

/**
 * Get market details from CLOB API
 */
async function getMarketDetails(conditionId: string): Promise<{
  prices: Record<string, number>;
  volume: number;
  liquidity: number;
} | null> {
  try {
    const response = await axios.get(`${POLYMARKET_API_BASE}/markets/${conditionId}`, {
      timeout: 10000,
    });

    if (response.data) {
      const market = response.data;
      const prices: Record<string, number> = {};

      if (market.tokens) {
        for (const token of market.tokens) {
          prices[token.outcome] = parseFloat(token.price) || 0;
        }
      }

      return {
        prices,
        volume: parseFloat(market.volume) || 0,
        liquidity: parseFloat(market.liquidity) || 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a market question contains Netflix keywords
 */
function isNetflixRelated(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  return NETFLIX_KEYWORDS.some((keyword) => lowerQuestion.includes(keyword));
}

/**
 * Try to link a market to existing Netflix titles
 */
async function findMatchingTitles(question: string): Promise<string[]> {
  const matchingTitleIds: string[] = [];

  // Get all titles
  const titles = await prisma.title.findMany({
    select: { id: true, canonicalName: true, aliases: true },
  });

  // Check if any title is mentioned in the question
  for (const title of titles) {
    const namesToCheck = [title.canonicalName];
    if (title.aliases) {
      namesToCheck.push(...(title.aliases as string[]));
    }

    for (const name of namesToCheck) {
      if (question.toLowerCase().includes(name.toLowerCase())) {
        matchingTitleIds.push(title.id);
        break;
      }
    }
  }

  return matchingTitleIds;
}

/**
 * Sync markets from discovered events
 */
async function syncMarkets(events: PolymarketEvent[], result: SyncResult): Promise<void> {
  for (const event of events) {
    for (const market of event.markets) {
      try {
        // Skip if not Netflix-related
        if (!isNetflixRelated(market.question) && !isNetflixRelated(event.title)) {
          continue;
        }

        result.marketsDiscovered++;

        // Parse outcomes
        let outcomes: Array<{ id: string; name: string }> = [];
        try {
          const outcomeNames = JSON.parse(market.outcomes || '[]');
          const outcomePrices = JSON.parse(market.outcomePrices || '[]');
          outcomes = outcomeNames.map((name: string, i: number) => ({
            id: i.toString(),
            name,
            price: parseFloat(outcomePrices[i]) || 0,
          }));
        } catch {
          outcomes = [];
        }

        // Upsert market
        const existingMarket = await prisma.polymarketMarket.findUnique({
          where: { conditionId: market.conditionId },
        });

        if (existingMarket) {
          await prisma.polymarketMarket.update({
            where: { id: existingMarket.id },
            data: {
              slug: market.slug,
              question: market.question,
              outcomes,
              endDate: market.endDate ? new Date(market.endDate) : null,
              resolved: market.closed,
              isActive: !market.closed,
            },
          });
          result.marketsUpdated++;
        } else {
          await prisma.polymarketMarket.create({
            data: {
              conditionId: market.conditionId,
              slug: market.slug,
              question: market.question,
              description: event.description,
              outcomes,
              category: event.category || 'Entertainment',
              endDate: market.endDate ? new Date(market.endDate) : null,
              resolved: market.closed,
              isActive: !market.closed,
            },
          });
          result.marketsCreated++;
        }

        // Create price snapshot
        const details = await getMarketDetails(market.conditionId);
        if (details) {
          const marketRecord = await prisma.polymarketMarket.findUnique({
            where: { conditionId: market.conditionId },
          });

          if (marketRecord) {
            await prisma.marketPriceSnapshot.create({
              data: {
                marketId: marketRecord.id,
                timestamp: new Date(),
                prices: details.prices,
                volume: details.volume,
                liquidity: details.liquidity,
              },
            });
            result.priceSnapshots++;
          }
        }

        // Try to link to Netflix titles
        const matchingTitles = await findMatchingTitles(market.question);
        for (const titleId of matchingTitles) {
          const marketRecord = await prisma.polymarketMarket.findUnique({
            where: { conditionId: market.conditionId },
          });

          if (marketRecord) {
            const existingLink = await prisma.marketTitleLink.findUnique({
              where: {
                marketId_titleId: {
                  titleId,
                  marketId: marketRecord.id,
                },
              },
            });

            if (!existingLink) {
              await prisma.marketTitleLink.create({
                data: { titleId, marketId: marketRecord.id },
              });
              result.titleLinksCreated++;
            }
          }
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        result.errors.push(
          `Error syncing market ${market.conditionId}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }
}

/**
 * Snapshot prices for all active markets
 */
async function snapshotPrices(result: SyncResult): Promise<void> {
  const activeMarkets = await prisma.polymarketMarket.findMany({
    where: { isActive: true },
  });

  for (const market of activeMarkets) {
    try {
      const details = await getMarketDetails(market.conditionId);
      if (details) {
        await prisma.marketPriceSnapshot.create({
          data: {
            marketId: market.id,
            timestamp: new Date(),
            prices: details.prices,
            volume: details.volume,
            liquidity: details.liquidity,
          },
        });
        result.priceSnapshots++;
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    } catch (error) {
      result.errors.push(
        `Error snapshotting ${market.conditionId}: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}

/**
 * Deduplicate weekly markets - mark older ones as inactive
 * Polymarket creates new markets each Tuesday, but old ones stay active
 * This finds duplicate market questions and keeps only the most recent one active
 */
async function deduplicateWeeklyMarkets(): Promise<number> {
  // Patterns for weekly Netflix markets that get recreated each week
  const weeklyPatterns = [
    'top global netflix show',
    'top us netflix show',
    '#2 global netflix show',
    '#2 us netflix show',
    'top global netflix movie',
    'top us netflix movie',
    '#2 global netflix movie',
    '#2 us netflix movie',
  ];

  let deactivated = 0;

  for (const pattern of weeklyPatterns) {
    // Find all active markets matching this pattern
    const markets = await prisma.polymarketMarket.findMany({
      where: {
        question: { contains: pattern, mode: 'insensitive' },
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, question: true, updatedAt: true },
    });

    // If more than one active market for same question, deactivate older ones
    if (markets.length > 1) {
      console.log(`Found ${markets.length} active markets for "${pattern}" - keeping newest`);

      // Skip the first (newest), deactivate the rest
      for (let i = 1; i < markets.length; i++) {
        await prisma.polymarketMarket.update({
          where: { id: markets[i].id },
          data: { isActive: false },
        });
        console.log(`  Deactivated old market: ${markets[i].question} (updated ${markets[i].updatedAt})`);
        deactivated++;
      }
    }
  }

  return deactivated;
}

/**
 * Main sync function
 */
export async function syncPolymarket(priceSnapshotOnly = false): Promise<SyncResult> {
  const result: SyncResult = {
    marketsDiscovered: 0,
    marketsCreated: 0,
    marketsUpdated: 0,
    priceSnapshots: 0,
    titleLinksCreated: 0,
    titlesCreated: 0,
    errors: [],
  };

  try {
    if (!priceSnapshotOnly) {
      // Step 1: Sync Polymarket titles to database
      // This creates Title records for any Polymarket outcomes we don't have yet
      console.log('Syncing Polymarket titles to database...');
      await syncPolymarketTitles(result);

      // Step 2: Discover new markets from Polymarket API
      console.log('Searching for Netflix-related markets...');
      const events = await searchNetflixEvents();
      console.log(`Found ${events.length} events to process`);

      await syncMarkets(events, result);

      // Step 3: Deduplicate weekly markets - keep only the newest active
      console.log('Deduplicating weekly markets...');
      const deactivated = await deduplicateWeeklyMarkets();
      if (deactivated > 0) {
        console.log(`Deactivated ${deactivated} old weekly markets`);
      }
    }

    // Snapshot prices for all active markets
    console.log('Snapshotting prices for active markets...');
    await snapshotPrices(result);
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : error}`);
  }

  return result;
}

/**
 * Run job with logging
 */
export async function runPolymarketJob(priceSnapshotOnly = false): Promise<void> {
  const startTime = Date.now();

  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: priceSnapshotOnly ? 'polymarket_prices' : 'polymarket_sync',
      status: 'RUNNING',
    },
  });

  try {
    console.log('Starting Polymarket sync...');
    const result = await syncPolymarket(priceSnapshotOnly);

    const duration = Date.now() - startTime;
    console.log(`Polymarket sync complete in ${duration}ms`);
    console.log(`Titles created: ${result.titlesCreated}`);
    console.log(`Markets: ${result.marketsCreated} created, ${result.marketsUpdated} updated`);
    console.log(`Price snapshots: ${result.priceSnapshots}`);
    console.log(`Title links: ${result.titleLinksCreated}`);

    if (result.errors.length > 0) {
      console.warn(`Errors (${result.errors.length}):`, result.errors.slice(0, 10));
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        detailsJson: {
          durationMs: duration,
          ...result,
          errors: result.errors.slice(0, 100),
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Polymarket sync failed:', error);

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
  const priceOnly = process.argv.includes('--prices-only');
  runPolymarketJob(priceOnly)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
