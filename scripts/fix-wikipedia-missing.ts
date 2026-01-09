/**
 * Fix missing Wikipedia data for Polymarket titles
 * Tests different article name variations and backfills historical data
 */
import prisma from '../src/lib/prisma';
import axios from 'axios';

const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

// Map of title canonical names to their actual Wikipedia article names
const WIKIPEDIA_ARTICLE_OVERRIDES: Record<string, string> = {
  'Priscilla': 'Priscilla_(2023_film)',
  'Wake Up Dead Man': 'Wake_Up_Dead_Man:_A_Knives_Out_Mystery',
  'People We Meet on Vacation': 'People_We_Meet_on_Vacation',
  'Ricky Gervais: Mortality': 'Ricky_Gervais',  // Individual article might work
  'Unlocked: A Jail Experiment': 'Unlocked:_A_Jail_Experiment',
};

async function testWikipediaArticle(articleName: string, startDate: string, endDate: string): Promise<{ date: string; views: number }[] | null> {
  try {
    const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleName)}/daily/${startDate}/${endDate}`;
    console.log(`  Testing: ${url}`);

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'PredictEasy/1.0 (Netflix Signal Tracker)' },
      timeout: 10000,
    });

    const items = response.data?.items;
    if (items && items.length > 0) {
      return items.map((item: { timestamp: string; views: number }) => ({
        date: `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`,
        views: item.views,
      }));
    }
    return null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('    → 404 Not Found');
    } else {
      console.log(`    → Error: ${error.message}`);
    }
    return null;
  }
}

async function findWorkingWikipediaArticle(titleName: string): Promise<{ articleName: string; data: { date: string; views: number }[] } | null> {
  // Check if we have a known override
  if (WIKIPEDIA_ARTICLE_OVERRIDES[titleName]) {
    console.log(`\nTrying override for "${titleName}": ${WIKIPEDIA_ARTICLE_OVERRIDES[titleName]}`);
    const data = await testWikipediaArticle(
      WIKIPEDIA_ARTICLE_OVERRIDES[titleName],
      '20260101',
      '20260107'
    );
    if (data) {
      return { articleName: WIKIPEDIA_ARTICLE_OVERRIDES[titleName], data };
    }
  }

  // Format the base title
  const baseName = titleName.replace(/\s+/g, '_').replace(/['"]/g, '');

  const suffixes = ['', '_(TV_series)', '_(film)', '_(2023_film)', '_(2024_film)', '_(2025_film)', '_(miniseries)', '_(Netflix_film)', '_(Netflix_series)', '_(American_film)'];

  console.log(`\nTrying variations for "${titleName}":`);
  for (const suffix of suffixes) {
    const articleName = baseName + suffix;
    const data = await testWikipediaArticle(articleName, '20260101', '20260107');
    if (data) {
      return { articleName, data };
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
  }

  return null;
}

async function main() {
  console.log('=== Fixing Wikipedia Missing Data ===\n');

  // Get Polymarket titles with no Wikipedia signals
  const polyTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } },
    },
    include: {
      dailySignals: {
        where: { source: 'WIKIPEDIA' },
        take: 1,
      },
    },
  });

  const missingWiki = polyTitles.filter(t => t.dailySignals.length === 0);
  console.log(`Polymarket titles missing Wikipedia data: ${missingWiki.length}`);
  console.log(missingWiki.map(t => `  - ${t.canonicalName}`).join('\n'));

  // Try to find Wikipedia articles for missing titles
  console.log('\n--- Searching for Wikipedia articles ---');

  const found: { title: any; articleName: string; data: { date: string; views: number }[] }[] = [];
  const notFound: string[] = [];

  for (const title of missingWiki) {
    const result = await findWorkingWikipediaArticle(title.canonicalName);
    if (result) {
      console.log(`  ✓ Found! ${title.canonicalName} → ${result.articleName}`);
      console.log(`    Sample data: ${result.data.slice(0, 3).map(d => `${d.date}: ${d.views}`).join(', ')}`);
      found.push({ title, ...result });
    } else {
      console.log(`  ✗ Not found: ${title.canonicalName}`);
      notFound.push(title.canonicalName);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Found Wikipedia articles: ${found.length}`);
  console.log(`Not found: ${notFound.length}`);

  if (found.length > 0) {
    console.log('\n--- Inserting signals for found articles ---');

    for (const { title, articleName, data } of found) {
      console.log(`Inserting ${data.length} signals for ${title.canonicalName}...`);

      for (const dayData of data) {
        const date = new Date(dayData.date);
        await prisma.dailySignal.upsert({
          where: {
            titleId_date_source_geo: {
              titleId: title.id,
              date: date,
              source: 'WIKIPEDIA',
              geo: 'GLOBAL',
            },
          },
          create: {
            titleId: title.id,
            date: date,
            source: 'WIKIPEDIA',
            geo: 'GLOBAL',
            value: dayData.views,
          },
          update: {
            value: dayData.views,
          },
        });
      }
      console.log(`  ✓ Inserted signals for ${title.canonicalName}`);
    }
  }

  if (notFound.length > 0) {
    console.log('\n--- Titles still missing (may need manual mapping) ---');
    for (const name of notFound) {
      console.log(`  - ${name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
