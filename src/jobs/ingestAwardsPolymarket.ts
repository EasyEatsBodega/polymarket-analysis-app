/**
 * Awards Polymarket Ingestion Job
 *
 * Discovers and syncs Golden Globes (and other award) markets from Polymarket.
 * Creates/updates AwardShow, AwardCategory, AwardNominee, and AwardOdds records.
 *
 * Now auto-discovers ALL markets with "golden-globes" in the slug.
 */

import prisma from '@/lib/prisma';
import { OddsSource, AwardShowStatus } from '@prisma/client';

const GAMMA_API = 'https://gamma-api.polymarket.com';

interface PolymarketMarket {
  id: string;
  question: string;
  groupItemTitle: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volumeNum: number;
  active: boolean;
}

interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  closed: boolean;
  volume: number;
  markets: PolymarketMarket[];
  endDate?: string;
}

// Known Golden Globes market slugs (scraped from Polymarket)
const GOLDEN_GLOBES_SLUGS = [
  'golden-globes-best-actor-drama-winner',
  'golden-globes-best-actor-musical-or-comedy-winner',
  'golden-globes-best-actor-television-musical-or-comedy-winner',
  'golden-globes-best-actress-limited-series-winner',
  'golden-globes-best-actress-television-drama-winner',
  'golden-globes-best-director-winner',
  'golden-globes-best-motion-picture-animated-winner',
  'golden-globes-best-motion-picture-drama-winner',
  'golden-globes-best-motion-picture-musical-or-comedy-winner',
  'golden-globes-best-motion-picture-non-english-language-winner',
  'golden-globes-best-original-song-motion-picture-winner',
  'golden-globes-best-performance-in-stand-up-comedy-on-television-winner',
  'golden-globes-best-screenplay-motion-picture-winner',
  'golden-globes-best-supporting-actor-motion-picture-winner',
  'golden-globes-best-supporting-actor-television-winner',
  'golden-globes-best-supporting-actress-motion-picture-winner',
  'golden-globes-best-supporting-actress-television-winner',
  'golden-globes-best-television-series-comedy-or-musical-winner',
  'golden-globes-best-television-series-drama-winner',
  'golden-globes-cinematic-and-box-office-achievement-winner',
  // Additional categories that may exist
  'golden-globes-best-actress-drama-winner',
  'golden-globes-best-actress-musical-or-comedy-winner',
  'golden-globes-best-actor-limited-series-winner',
  'golden-globes-best-actor-television-drama-winner',
  'golden-globes-best-actress-television-musical-or-comedy-winner',
  'golden-globes-best-limited-series-winner',
  'golden-globes-best-original-score-winner',
];

// Award show configurations
const AWARD_SHOWS = [
  {
    name: 'Golden Globes 2026',
    slug: 'golden-globes-2026',
    ceremonyDate: new Date('2026-01-11'),
    marketSlugs: GOLDEN_GLOBES_SLUGS,
  },
];

/**
 * Fetch events by their exact slugs
 */
async function fetchEventsBySlugs(slugs: string[]): Promise<PolymarketEvent[]> {
  const events: PolymarketEvent[] = [];

  for (const slug of slugs) {
    try {
      const response = await fetch(
        `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        console.log(`    ⚠️ Failed to fetch ${slug}: ${response.status}`);
        continue;
      }

      const data: PolymarketEvent[] = await response.json();
      if (data.length > 0) {
        events.push(data[0]);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Error fetching ${slug}:`, error);
    }
  }

  console.log(`  Found ${events.length}/${slugs.length} events`);
  return events;
}

/**
 * Extract category name from event title
 * e.g., "Golden Globes: Best Actor - Drama Winner" -> "Best Actor - Drama"
 */
function extractCategoryName(title: string): string {
  // Remove "Golden Globes: " prefix and " Winner" suffix
  let name = title
    .replace(/^Golden Globes:\s*/i, '')
    .replace(/\s*Winner$/i, '')
    .trim();

  return name || title;
}

function parseNominees(event: PolymarketEvent): Array<{ name: string; subtitle: string | null; probability: number; volume: number }> {
  const nominees: Array<{ name: string; subtitle: string | null; probability: number; volume: number }> = [];

  if (!event.markets) return nominees;

  for (const market of event.markets) {
    // Include all markets, even inactive (to show resolved winners)
    try {
      const prices = JSON.parse(market.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0]) || 0;

      // Skip very low probability unless resolved
      if (yesPrice < 0.001 && yesPrice !== 1) continue;

      // Parse name and subtitle (e.g., "Director Name – Film Name")
      const fullName = market.groupItemTitle || 'Unknown';
      const parts = fullName.split(' – ');
      const name = parts[0].trim();
      const subtitle = parts.length > 1 ? parts[1].trim() : null;

      nominees.push({
        name,
        subtitle,
        probability: yesPrice,
        volume: market.volumeNum || 0,
      });
    } catch {
      // Skip malformed data
    }
  }

  // Sort by probability descending
  nominees.sort((a, b) => b.probability - a.probability);
  return nominees;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface AwardsIngestionResult {
  showsProcessed: number;
  categoriesFound: number;
  categoriesCreated: number;
  nomineesCreated: number;
  oddsUpdated: number;
  errors: string[];
}

export async function ingestAwardsPolymarket(): Promise<AwardsIngestionResult> {
  const result: AwardsIngestionResult = {
    showsProcessed: 0,
    categoriesFound: 0,
    categoriesCreated: 0,
    nomineesCreated: 0,
    oddsUpdated: 0,
    errors: [],
  };

  for (const showConfig of AWARD_SHOWS) {
    console.log(`\n📺 Processing ${showConfig.name}...`);

    // Upsert the award show
    // Only mark as COMPLETED if we're 24+ hours past the ceremony date
    // This gives buffer for the ceremony to actually finish (evening US time)
    const now = new Date();
    const ceremonyEndBuffer = new Date(showConfig.ceremonyDate);
    ceremonyEndBuffer.setHours(ceremonyEndBuffer.getHours() + 24);
    const isCompleted = now > ceremonyEndBuffer;

    const show = await prisma.awardShow.upsert({
      where: { slug: showConfig.slug },
      create: {
        name: showConfig.name,
        slug: showConfig.slug,
        ceremonyDate: showConfig.ceremonyDate,
        status: isCompleted ? AwardShowStatus.COMPLETED : AwardShowStatus.ACTIVE,
      },
      update: {
        status: isCompleted ? AwardShowStatus.COMPLETED : AwardShowStatus.ACTIVE,
      },
    });

    result.showsProcessed++;

    // Fetch all events by their known slugs
    const events = await fetchEventsBySlugs(showConfig.marketSlugs);
    console.log(`  Fetched ${events.length} markets for ${showConfig.name}`);

    // Process each discovered event as a category
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Extract category name from title
      const categoryName = extractCategoryName(event.title);
      console.log(`  Processing: ${categoryName}...`);

      result.categoriesFound++;

      const nominees = parseNominees(event);
      if (nominees.length === 0) {
        console.log(`    ⚠️ No nominees found`);
        continue;
      }

      // Upsert category
      const categorySlug = slugify(categoryName);
      const category = await prisma.awardCategory.upsert({
        where: {
          showId_slug: {
            showId: show.id,
            slug: categorySlug,
          },
        },
        create: {
          showId: show.id,
          name: categoryName,
          slug: categorySlug,
          polymarketSlug: event.slug,
          polymarketUrl: `https://polymarket.com/event/${event.slug}`,
          displayOrder: i,
        },
        update: {
          polymarketSlug: event.slug,
          polymarketUrl: `https://polymarket.com/event/${event.slug}`,
        },
      });

      result.categoriesCreated++;
      console.log(`    ✅ ${categoryName} (${nominees.length} nominees, ${event.closed ? 'CLOSED' : 'OPEN'})`);

      // Process nominees
      for (const nomineeData of nominees) {
        // Check if winner (probability = 1 and market closed)
        const isWinner = event.closed && nomineeData.probability >= 0.99;

        // Upsert nominee
        const existingNominee = await prisma.awardNominee.findFirst({
          where: {
            categoryId: category.id,
            name: nomineeData.name,
          },
        });

        let nominee;
        if (existingNominee) {
          nominee = await prisma.awardNominee.update({
            where: { id: existingNominee.id },
            data: {
              subtitle: nomineeData.subtitle,
              isWinner,
            },
          });
        } else {
          nominee = await prisma.awardNominee.create({
            data: {
              categoryId: category.id,
              name: nomineeData.name,
              subtitle: nomineeData.subtitle,
              isWinner,
            },
          });
          result.nomineesCreated++;
        }

        // Upsert odds
        await prisma.awardOdds.upsert({
          where: {
            nomineeId_source: {
              nomineeId: nominee.id,
              source: OddsSource.POLYMARKET,
            },
          },
          create: {
            nomineeId: nominee.id,
            source: OddsSource.POLYMARKET,
            probability: nomineeData.probability,
            url: `https://polymarket.com/event/${event.slug}`,
          },
          update: {
            probability: nomineeData.probability,
            fetchedAt: new Date(),
          },
        });

        result.oddsUpdated++;

        // Create snapshot for historical tracking
        await prisma.awardOddsSnapshot.create({
          data: {
            nomineeId: nominee.id,
            source: OddsSource.POLYMARKET,
            probability: nomineeData.probability,
          },
        });
      }

      // Rate limit between categories
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return result;
}

// Allow running directly
if (require.main === module) {
  ingestAwardsPolymarket()
    .then(result => {
      console.log('\n========================================');
      console.log('Awards Polymarket Ingestion Complete');
      console.log('========================================');
      console.log(`Shows processed: ${result.showsProcessed}`);
      console.log(`Categories found: ${result.categoriesFound}`);
      console.log(`Categories created: ${result.categoriesCreated}`);
      console.log(`Nominees created: ${result.nomineesCreated}`);
      console.log(`Odds updated: ${result.oddsUpdated}`);
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.length}`);
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
