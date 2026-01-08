/**
 * Gold Derby Expert Consensus Ingestion Job
 *
 * Gold Derby aggregates predictions from:
 * - Expert predictions (major media outlets)
 * - Editor predictions (full-time awards analysts)
 * - Top 24 users (best accuracy from prior year)
 * - All-star users (best 2-year performers)
 * - General user predictions
 *
 * Data is manually entered due to Gold Derby ToS.
 * Odds are expressed as percentages (e.g., 85 = 85% chance to win)
 */

import prisma from '@/lib/prisma';
import { OddsSource, Prisma } from '@prisma/client';

// Define types for the show with included categories and nominees
type ShowWithCategoriesAndNominees = Prisma.AwardShowGetPayload<{
  include: {
    categories: {
      include: {
        nominees: true;
      };
    };
  };
}>;
type CategoryWithNominees = ShowWithCategoriesAndNominees['categories'][number];
type Nominee = CategoryWithNominees['nominees'][number];

/**
 * Gold Derby consensus odds data (manually entered)
 * Format: category -> nominee name -> percentage (0-100)
 *
 * These represent the combined expert consensus from Gold Derby
 * Updated: 2026-01-07
 */
const GOLDDERBY_ODDS: Record<string, Record<string, number>> = {
  'Best Director': {
    'Paul Thomas Anderson': 87,
    'Jafar Panahi': 5,
    'Chloe Zhao': 4,
    'Ryan Coogler': 2,
    'Joachim Trier': 1,
    'Guillermo Del Toro': 1,
  },
  'Best Actor - Drama': {
    'Wagner Moura': 68,
    'Michael B. Jordan': 24,
    'Dwayne Johnson': 4,
    'Jeremy Allen White': 2,
    'Joel Edgerton': 1,
    'Oscar Isaac': 1,
  },
  'Best Actress - Drama': {
    'Jessie Buckley': 91,
    'Renate Reinsve': 5,
    'Jennifer Lawrence': 2,
    'Julia Roberts': 1,
    'Tessa Thompson': 0.5,
    'Eva Victor': 0.5,
  },
  'Best Actor - Musical or Comedy': {
    'Timothee Chalamet': 72,
    'Leonardo DiCaprio': 20,
    'Ethan Hawke': 5,
    'Lee Byung-Hun': 2,
    'Jesse Plemons': 0.5,
    'George Clooney': 0.5,
  },
  'Best Actress - Musical or Comedy': {
    'Rose Byrne': 78,
    'Emma Stone': 12,
    'Chase Infiniti': 5,
    'Kate Hudson': 3,
    'Cynthia Erivo': 1,
    'Amanda Seyfried': 1,
  },
  'Best Animated Motion Picture': {
    'K-Pop Demon Hunters': 88,
    'Little Amelie Or The Character of Rain': 5,
    'Arco': 3,
    'Zootopia 2': 2,
    'Elio': 1,
    'Demon Slayer': 1,
  },
  'Best Screenplay': {
    'One Battle After Another': 55,
    'It Was Just An Accident': 28,
    'Sinners': 10,
    'Sentimental Value': 4,
    'Marty Supreme': 2,
    'Hamnet': 1,
  },
  'Cinematic and Box Office Achievement': {
    'Sinners': 72,
    'Avatar: Fire And Ash': 15,
    'K-Pop Demon Hunters': 7,
    'Wicked: For Good': 3,
    'Zootopia 2': 2,
    'Weapons': 0.5,
    'F1': 0.3,
    'Mission: Impossible': 0.2,
  },
};

/**
 * Category name mapping from Gold Derby to our database
 * Note: Database uses mix of regular hyphens (-) and en-dashes (–)
 */
const CATEGORY_MAPPING: Record<string, string> = {
  'Best Director': 'Best Director',
  'Best Actor - Drama': 'Best Actor - Drama',  // Regular hyphen in DB
  'Best Actress - Drama': 'Best Actress – Drama',  // En-dash in DB
  'Best Actor - Musical or Comedy': 'Best Actor – Musical or Comedy',
  'Best Actress - Musical or Comedy': 'Best Actress – Musical or Comedy',
  'Best Animated Motion Picture': 'Best Motion Picture – Animated',
  'Best Screenplay': 'Best Screenplay – Motion Picture',
  'Cinematic and Box Office Achievement': 'Cinematic and Box Office Achievement',
};

export interface GoldDerbyIngestionResult {
  categoriesProcessed: number;
  nomineesMatched: number;
  oddsCreated: number;
  oddsUpdated: number;
  unmatched: string[];
  errors: string[];
}

export async function ingestGoldDerby(): Promise<GoldDerbyIngestionResult> {
  const result: GoldDerbyIngestionResult = {
    categoriesProcessed: 0,
    nomineesMatched: 0,
    oddsCreated: 0,
    oddsUpdated: 0,
    unmatched: [],
    errors: [],
  };

  console.log('🏆 Starting Gold Derby consensus ingestion...\n');

  // Get the Golden Globes 2026 show
  const show: ShowWithCategoriesAndNominees | null = await prisma.awardShow.findUnique({
    where: { slug: 'golden-globes-2026' },
    include: {
      categories: {
        include: {
          nominees: true,
        },
      },
    },
  });

  if (!show) {
    result.errors.push('Golden Globes 2026 show not found');
    return result;
  }

  // Process each Gold Derby category
  for (const [gdCategory, nominees] of Object.entries(GOLDDERBY_ODDS)) {
    result.categoriesProcessed++;
    console.log(`Processing: ${gdCategory}`);

    // Find matching category in our database
    const mappedName = CATEGORY_MAPPING[gdCategory] || gdCategory;

    // Try exact match first
    let category = show.categories.find((c: CategoryWithNominees) => c.name === mappedName);

    // Fall back to case-insensitive match
    if (!category) {
      category = show.categories.find((c: CategoryWithNominees) =>
        c.name.toLowerCase() === mappedName.toLowerCase()
      );
    }

    if (!category) {
      console.log(`  ⚠️ No matching category found for "${gdCategory}"`);
      result.unmatched.push(`Category: ${gdCategory}`);
      continue;
    }

    console.log(`  → Matched to: ${category.name}`);

    // Process each nominee
    for (const [nomineeName, percentage] of Object.entries(nominees)) {
      const probability = percentage / 100; // Convert percentage to 0-1

      // Try to find matching nominee (fuzzy match)
      const nominee = category.nominees.find((n: Nominee) => {
        const dbName = n.name.toLowerCase();
        const gdName = nomineeName.toLowerCase();

        // Exact match
        if (dbName === gdName) return true;

        // Contains match
        if (dbName.includes(gdName) || gdName.includes(dbName)) return true;

        // Last name match
        const dbLastName = dbName.split(' ').pop() || '';
        const gdLastName = gdName.split(' ').pop() || '';
        if (dbLastName === gdLastName && dbLastName.length > 3) return true;

        return false;
      });

      if (!nominee) {
        console.log(`    ⚠️ No match for nominee: ${nomineeName}`);
        result.unmatched.push(`${category.name}: ${nomineeName}`);
        continue;
      }

      result.nomineesMatched++;

      // Upsert the Gold Derby odds
      const existingOdds = await prisma.awardOdds.findUnique({
        where: {
          nomineeId_source: {
            nomineeId: nominee.id,
            source: OddsSource.GOLDDERBY,
          },
        },
      });

      if (existingOdds) {
        await prisma.awardOdds.update({
          where: { id: existingOdds.id },
          data: {
            probability,
            rawOdds: `${percentage}%`,
            fetchedAt: new Date(),
          },
        });
        result.oddsUpdated++;
      } else {
        await prisma.awardOdds.create({
          data: {
            nomineeId: nominee.id,
            source: OddsSource.GOLDDERBY,
            probability,
            rawOdds: `${percentage}%`,
            url: 'https://www.goldderby.com/odds/golden-globes-2026/',
          },
        });
        result.oddsCreated++;
      }

      console.log(`    ✅ ${nominee.name}: ${percentage}%`);

      // Create snapshot
      await prisma.awardOddsSnapshot.create({
        data: {
          nomineeId: nominee.id,
          source: OddsSource.GOLDDERBY,
          probability,
        },
      });
    }
  }

  return result;
}

// Allow running directly
if (require.main === module) {
  ingestGoldDerby()
    .then(result => {
      console.log('\n========================================');
      console.log('Gold Derby Ingestion Complete');
      console.log('========================================');
      console.log(`Categories processed: ${result.categoriesProcessed}`);
      console.log(`Nominees matched: ${result.nomineesMatched}`);
      console.log(`Odds created: ${result.oddsCreated}`);
      console.log(`Odds updated: ${result.oddsUpdated}`);
      if (result.unmatched.length > 0) {
        console.log(`\nUnmatched items (${result.unmatched.length}):`);
        result.unmatched.forEach(u => console.log(`  - ${u}`));
      }
      if (result.errors.length > 0) {
        console.log(`\nErrors: ${result.errors.length}`);
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
