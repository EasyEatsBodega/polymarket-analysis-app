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
  errors: string[];
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
 * Main sync function
 */
export async function syncPolymarket(priceSnapshotOnly = false): Promise<SyncResult> {
  const result: SyncResult = {
    marketsDiscovered: 0,
    marketsCreated: 0,
    marketsUpdated: 0,
    priceSnapshots: 0,
    titleLinksCreated: 0,
    errors: [],
  };

  try {
    if (!priceSnapshotOnly) {
      // Discover new markets
      console.log('Searching for Netflix-related markets...');
      const events = await searchNetflixEvents();
      console.log(`Found ${events.length} events to process`);

      await syncMarkets(events, result);
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
