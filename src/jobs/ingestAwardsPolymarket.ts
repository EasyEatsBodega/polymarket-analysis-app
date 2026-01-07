/**
 * Awards Polymarket Ingestion Job
 *
 * Discovers and syncs Golden Globes (and other award) markets from Polymarket.
 * Creates/updates AwardShow, AwardCategory, AwardNominee, and AwardOdds records.
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

// Award show configurations
const AWARD_SHOWS = [
  {
    name: 'Golden Globes 2026',
    slug: 'golden-globes-2026',
    ceremonyDate: new Date('2026-01-05'),
    slugPrefix: 'golden-globes-',
    categoryPatterns: [
      { slug: 'golden-globes-best-director-winner', name: 'Best Director' },
      { slug: 'golden-globes-best-podcast-winner', name: 'Best Podcast' },
      { slug: 'golden-globes-cinematic-and-box-office-achievement-winner', name: 'Cinematic and Box Office Achievement' },
      { slug: 'golden-globes-best-actor-drama', name: 'Best Actor - Drama' },
      { slug: 'golden-globes-best-actress-drama', name: 'Best Actress - Drama' },
      { slug: 'golden-globes-best-motion-picture-drama', name: 'Best Motion Picture - Drama' },
      { slug: 'golden-globes-best-motion-picture-musical-or-comedy', name: 'Best Motion Picture - Musical or Comedy' },
      { slug: 'golden-globes-best-motion-picture-animated', name: 'Best Motion Picture - Animated' },
      { slug: 'golden-globes-best-motion-picture-non-english-language', name: 'Best Motion Picture - Non-English Language' },
      { slug: 'golden-globes-best-actor-musical-or-comedy', name: 'Best Actor - Musical or Comedy' },
      { slug: 'golden-globes-best-actress-musical-or-comedy', name: 'Best Actress - Musical or Comedy' },
      { slug: 'golden-globes-best-supporting-actor-motion-picture', name: 'Best Supporting Actor - Motion Picture' },
      { slug: 'golden-globes-best-supporting-actress-motion-picture', name: 'Best Supporting Actress - Motion Picture' },
      { slug: 'golden-globes-best-screenplay-motion-picture', name: 'Best Screenplay - Motion Picture' },
      { slug: 'golden-globes-best-original-song', name: 'Best Original Song' },
      { slug: 'golden-globes-best-original-score', name: 'Best Original Score' },
      { slug: 'golden-globes-best-television-series-drama', name: 'Best Television Series - Drama' },
      { slug: 'golden-globes-best-television-series-comedy-musical', name: 'Best Television Series - Comedy/Musical' },
      { slug: 'golden-globes-best-television-limited-series', name: 'Best Television Limited Series' },
      { slug: 'golden-globes-best-actor-television-drama', name: 'Best Actor - Television Drama' },
      { slug: 'golden-globes-best-actress-television-drama', name: 'Best Actress - Television Drama' },
      { slug: 'golden-globes-best-actor-television-limited-series', name: 'Best Actor - Television Limited Series' },
      { slug: 'golden-globes-best-actress-television-limited-series', name: 'Best Actress - Television Limited Series' },
      { slug: 'golden-globes-best-supporting-actor-television', name: 'Best Supporting Actor - Television' },
      { slug: 'golden-globes-best-supporting-actress-television', name: 'Best Supporting Actress - Television' },
    ],
  },
];

async function fetchEvent(slug: string): Promise<PolymarketEvent | null> {
  try {
    const response = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const events: PolymarketEvent[] = await response.json();
    return events.length > 0 ? events[0] : null;
  } catch (error) {
    console.error(`Error fetching ${slug}:`, error);
    return null;
  }
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
    const show = await prisma.awardShow.upsert({
      where: { slug: showConfig.slug },
      create: {
        name: showConfig.name,
        slug: showConfig.slug,
        ceremonyDate: showConfig.ceremonyDate,
        status: showConfig.ceremonyDate < new Date() ? AwardShowStatus.COMPLETED : AwardShowStatus.ACTIVE,
      },
      update: {
        status: showConfig.ceremonyDate < new Date() ? AwardShowStatus.COMPLETED : AwardShowStatus.ACTIVE,
      },
    });

    result.showsProcessed++;

    // Process each category pattern
    for (let i = 0; i < showConfig.categoryPatterns.length; i++) {
      const pattern = showConfig.categoryPatterns[i];
      console.log(`  Checking ${pattern.name}...`);

      const event = await fetchEvent(pattern.slug);

      if (!event) {
        console.log(`    ❌ Not found on Polymarket`);
        continue;
      }

      result.categoriesFound++;

      const nominees = parseNominees(event);
      if (nominees.length === 0) {
        console.log(`    ⚠️ No nominees found`);
        continue;
      }

      // Upsert category
      const categorySlug = slugify(pattern.name);
      const category = await prisma.awardCategory.upsert({
        where: {
          showId_slug: {
            showId: show.id,
            slug: categorySlug,
          },
        },
        create: {
          showId: show.id,
          name: pattern.name,
          slug: categorySlug,
          polymarketSlug: pattern.slug,
          polymarketUrl: `https://polymarket.com/event/${event.slug}`,
          displayOrder: i,
        },
        update: {
          polymarketSlug: pattern.slug,
          polymarketUrl: `https://polymarket.com/event/${event.slug}`,
        },
      });

      result.categoriesCreated++;
      console.log(`    ✅ ${pattern.name} (${nominees.length} nominees, ${event.closed ? 'CLOSED' : 'OPEN'})`);

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

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
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
