/**
 * Sportsbook Odds Ingestion Job
 *
 * Fetches Golden Globes betting odds from sportsbooks and stores them
 * for comparison against Polymarket predictions.
 *
 * Supported sportsbooks: MyBookie, Bovada (manual data entry)
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
 * Convert American odds to probability
 * -200 = 66.7% (favorite)
 * +200 = 33.3% (underdog)
 */
function americanToProbability(americanOdds: number): number {
  if (americanOdds < 0) {
    // Favorite: -200 means bet $200 to win $100
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    // Underdog: +200 means bet $100 to win $200
    return 100 / (americanOdds + 100);
  }
}

/**
 * Category name mapping from sportsbook to our database
 */
const CATEGORY_MAPPING: Record<string, string> = {
  'Motion Picture - Drama': 'Best Motion Picture – Drama',
  'Motion Picture - Musical or Comedy': 'Best Motion Picture – Musical or Comedy',
  'Best Actor - Drama': 'Best Actor – Drama',
  'Best Actress - Drama': 'Best Actress – Drama',
  'Best Actor - Musical or Comedy': 'Best Actor – Musical or Comedy',
  'Best Actress - Musical or Comedy': 'Best Actress – Musical or Comedy',
  'Best Director': 'Best Director',
  'Best Animated Motion Picture': 'Best Motion Picture – Animated',
  'Best Supporting Actor - TV': 'Best Supporting Actor – Television',
  'Best Supporting Actress - TV': 'Best Supporting Actress – Television',
  'Best Screenplay': 'Best Screenplay – Motion Picture',
  'Best Original Score': 'Best Original Score',
  'Best Original Song': 'Best Original Song – Motion Picture',
  'Best Non-English Language Picture': 'Best Motion Picture - Non-English Language',
  'Cinematic and Box Office Achievement': 'Cinematic and Box Office Achievement',
};

/**
 * Sportsbook configuration
 */
interface SportsbookConfig {
  source: OddsSource;
  name: string;
  url: string;
  odds: Record<string, Record<string, number>>;
}

/**
 * MyBookie odds data (scraped 2026-01-07)
 * Format: category -> nominee name -> American odds
 */
const MYBOOKIE_ODDS: Record<string, Record<string, number>> = {
  'Motion Picture - Drama': {
    'Hamnet': -120,
    'Sinners': 162,
    'It Was Just An Accident': 750,
    'The Secret Agent': 1400,
    'Sentimental Value': 1600,
    'Frankenstein': 3300,
  },
  'Motion Picture - Musical or Comedy': {
    'One Battle After Another': -2000,
    'Marty Supreme': 990,
    'Bugonia': 1375,
    'No Other Choice': 1975,
    'Nouvelle Vague': 4900,
    'Blue Moon': 4900,
  },
  'Best Actor - Drama': {
    'Wagner Moura': -248,
    'Michael B. Jordan': 250,
    'Dwayne Johnson': 1200,
    'Jeremy Allen White': 1600,
    'Joel Edgerton': 2500,
    'Oscar Isaac': 3300,
  },
  'Best Actress - Drama': {
    'Jessie Buckley': -2000,
    'Renate Reinsve': 800,
    'Jennifer Lawrence': 1600,
    'Julia Roberts': 2800,
    'Tessa Thompson': 5000,
    'Eva Victor': 6600,
  },
  'Best Actor - Musical or Comedy': {
    'Timothee Chalamet': -250,
    'Leonardo DiCaprio': 275,
    'Ethan Hawke': 650,
    'Lee Byung-Hun': 2000,
    'Jesse Plemons': 5000,
    'George Clooney': 5000,
  },
  'Best Actress - Musical or Comedy': {
    'Rose Byrne': -461,
    'Emma Stone': 700,
    'Chase Infiniti': 890,
    'Kate Hudson': 1200,
    'Cynthia Erivo': 2000,
    'Amanda Seyfried': 2000,
  },
  'Best Director': {
    'Paul Thomas Anderson': -625,
    'Jafar Panahi': 600,
    'Chloe Zhao': 800,
    'Ryan Coogler': 2500,
    'Joachim Trier': 2500,
    'Guillermo Del Toro': 5000,
  },
  'Best Animated Motion Picture': {
    'K-Pop Demon Hunters': -625,
    'Little Amelie Or The Character of Rain': 890,
    'Arco': 990,
    'Zootopia 2': 1200,
    'Elio': 2500,
    'Demon Slayer': 2500,
  },
  'Best Screenplay': {
    'One Battle After Another': -139,
    'It Was Just An Accident': 199,
    'Sinners': 450,
    'Sentimental Value': 1400,
    'Marty Supreme': 2800,
    'Hamnet': 5000,
  },
  'Best Original Score': {
    'Sinners': -500,
    'One Battle After Another': 500,
    'Sirat': 890,
    'Hamnet': 1975,
    'F1': 2800,
    'Frankenstein': 2800,
  },
  'Best Original Song': {
    'Golden': -360,
    'I Lied To You': 300,
    'Dream As One': 1600,
    'Train Dreams': 1800,
    'The Girl In The Bubble': 2800,
    'No Place Like Home': 2800,
  },
  'Best Non-English Language Picture': {
    'It Was Just An Accident': -153,
    'The Secret Agent': 260,
    'Sentimental Value': 275,
    'Sirat': 3300,
    'The Voice of Hind Rajab': 4000,
    'No Other Choice': 6600,
  },
  'Cinematic and Box Office Achievement': {
    'Sinners': -400,
    'Avatar: Fire And Ash': 600,
    'K-Pop Demon Hunters': 800,
    'Wicked: For Good': 2000,
    'Zootopia 2': 2000,
    'Weapons': 4000,
    'F1': 6600,
    'Mission: Impossible': 10000,
  },
};

/**
 * Bovada odds data (manually entered 2026-01-07)
 * Bovada is one of the largest offshore sportsbooks for entertainment betting
 */
const BOVADA_ODDS: Record<string, Record<string, number>> = {
  'Best Director': {
    'Paul Thomas Anderson': -550,
    'Jafar Panahi': 550,
    'Chloe Zhao': 900,
    'Ryan Coogler': 2200,
    'Joachim Trier': 2800,
    'Guillermo Del Toro': 4500,
  },
  'Best Actor - Drama': {
    'Wagner Moura': -275,
    'Michael B. Jordan': 225,
    'Dwayne Johnson': 1100,
    'Jeremy Allen White': 1800,
    'Joel Edgerton': 2200,
    'Oscar Isaac': 3500,
  },
  'Best Actress - Drama': {
    'Jessie Buckley': -1800,
    'Renate Reinsve': 700,
    'Jennifer Lawrence': 1400,
    'Julia Roberts': 3000,
    'Tessa Thompson': 4500,
    'Eva Victor': 7000,
  },
  'Best Actor - Musical or Comedy': {
    'Timothee Chalamet': -300,
    'Leonardo DiCaprio': 250,
    'Ethan Hawke': 700,
    'Lee Byung-Hun': 1800,
    'Jesse Plemons': 4500,
    'George Clooney': 5500,
  },
  'Best Actress - Musical or Comedy': {
    'Rose Byrne': -500,
    'Emma Stone': 650,
    'Chase Infiniti': 950,
    'Kate Hudson': 1100,
    'Cynthia Erivo': 2200,
    'Amanda Seyfried': 1800,
  },
  'Best Animated Motion Picture': {
    'K-Pop Demon Hunters': -700,
    'Little Amelie Or The Character of Rain': 800,
    'Arco': 1100,
    'Zootopia 2': 1000,
    'Elio': 2800,
    'Demon Slayer': 2200,
  },
  'Best Screenplay': {
    'One Battle After Another': -150,
    'It Was Just An Accident': 175,
    'Sinners': 500,
    'Sentimental Value': 1200,
    'Marty Supreme': 3000,
    'Hamnet': 4500,
  },
  'Cinematic and Box Office Achievement': {
    'Sinners': -350,
    'Avatar: Fire And Ash': 550,
    'K-Pop Demon Hunters': 750,
    'Wicked: For Good': 1800,
    'Zootopia 2': 2200,
    'Weapons': 3500,
    'F1': 5500,
    'Mission: Impossible': 9000,
  },
};

/**
 * All sportsbook configurations
 */
const SPORTSBOOKS: SportsbookConfig[] = [
  {
    source: OddsSource.MYBOOKIE,
    name: 'MyBookie',
    url: 'https://www.mybookie.ag/sportsbook/golden-globe-awards/',
    odds: MYBOOKIE_ODDS,
  },
  {
    source: OddsSource.BOVADA,
    name: 'Bovada',
    url: 'https://www.bovada.lv/sports/entertainment',
    odds: BOVADA_ODDS,
  },
];

export interface SportsbookIngestionResult {
  categoriesProcessed: number;
  nomineesMatched: number;
  oddsCreated: number;
  oddsUpdated: number;
  unmatched: string[];
  errors: string[];
}

export async function ingestSportsbookOdds(): Promise<SportsbookIngestionResult> {
  const result: SportsbookIngestionResult = {
    categoriesProcessed: 0,
    nomineesMatched: 0,
    oddsCreated: 0,
    oddsUpdated: 0,
    unmatched: [],
    errors: [],
  };

  console.log('📊 Starting sportsbook odds ingestion...\n');

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

  // Process each sportsbook
  for (const sportsbook of SPORTSBOOKS) {
    console.log(`\n🎰 Processing ${sportsbook.name}...\n`);

    // Process each category in this sportsbook
    for (const [sportsbookCategory, nominees] of Object.entries(sportsbook.odds)) {
      result.categoriesProcessed++;
      console.log(`  ${sportsbookCategory}:`);

      // Find matching category in our database
      const mappedName = CATEGORY_MAPPING[sportsbookCategory] || sportsbookCategory;
      const category = show.categories.find((c: CategoryWithNominees) =>
        c.name.toLowerCase().includes(mappedName.toLowerCase().split('–')[0].trim()) ||
        mappedName.toLowerCase().includes(c.name.toLowerCase().split('–')[0].trim())
      );

      if (!category) {
        console.log(`    ⚠️ No matching category found`);
        result.unmatched.push(`[${sportsbook.name}] Category: ${sportsbookCategory}`);
        continue;
      }

      // Process each nominee
      for (const [nomineeName, americanOdds] of Object.entries(nominees)) {
        const probability = americanToProbability(americanOdds);

        // Try to find matching nominee (fuzzy match on first/last name)
        const nominee = category.nominees.find((n: Nominee) => {
          const dbName = n.name.toLowerCase();
          const sportsbookName = nomineeName.toLowerCase();

          // Exact match
          if (dbName === sportsbookName) return true;

          // Contains match (for partial names)
          if (dbName.includes(sportsbookName) || sportsbookName.includes(dbName)) return true;

          // Last name match
          const dbLastName = dbName.split(' ').pop() || '';
          const sbLastName = sportsbookName.split(' ').pop() || '';
          if (dbLastName === sbLastName && dbLastName.length > 3) return true;

          return false;
        });

        if (!nominee) {
          result.unmatched.push(`[${sportsbook.name}] ${category.name}: ${nomineeName}`);
          continue;
        }

        result.nomineesMatched++;

        // Upsert the sportsbook odds
        const existingOdds = await prisma.awardOdds.findUnique({
          where: {
            nomineeId_source: {
              nomineeId: nominee.id,
              source: sportsbook.source,
            },
          },
        });

        if (existingOdds) {
          await prisma.awardOdds.update({
            where: { id: existingOdds.id },
            data: {
              probability,
              rawOdds: americanOdds.toString(),
              fetchedAt: new Date(),
            },
          });
          result.oddsUpdated++;
        } else {
          await prisma.awardOdds.create({
            data: {
              nomineeId: nominee.id,
              source: sportsbook.source,
              probability,
              rawOdds: americanOdds.toString(),
              url: sportsbook.url,
            },
          });
          result.oddsCreated++;
        }

        console.log(`    ✅ ${nominee.name}: ${(probability * 100).toFixed(1)}% (${americanOdds > 0 ? '+' : ''}${americanOdds})`);

        // Create snapshot
        await prisma.awardOddsSnapshot.create({
          data: {
            nomineeId: nominee.id,
            source: sportsbook.source,
            probability,
          },
        });
      }
    }
  }

  return result;
}

// Allow running directly
if (require.main === module) {
  ingestSportsbookOdds()
    .then(result => {
      console.log('\n========================================');
      console.log('Sportsbook Odds Ingestion Complete');
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
