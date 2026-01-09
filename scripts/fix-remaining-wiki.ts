/**
 * Fix remaining Wikipedia data issues
 */
import prisma from '../src/lib/prisma';
import axios from 'axios';

const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

async function fetchWikipediaData(articleName: string, startDate: string, endDate: string): Promise<{ date: string; views: number }[] | null> {
  try {
    const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleName)}/daily/${startDate}/${endDate}`;
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
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== Fixing Remaining Wikipedia Issues ===\n');

  // Find the misspelled Evil Influencer title
  const misspelledTitle = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Hidebrandt', mode: 'insensitive' } },
  });

  if (misspelledTitle) {
    console.log(`Found misspelled title: ${misspelledTitle.canonicalName}`);
    console.log('Using correct Wikipedia article: Evil_Influencer:_The_Jodi_Hildebrandt_Story');

    // Fetch data using correct spelling
    const data = await fetchWikipediaData('Evil_Influencer:_The_Jodi_Hildebrandt_Story', '20260101', '20260107');

    if (data) {
      console.log(`Found ${data.length} days of data`);

      for (const dayData of data) {
        const date = new Date(dayData.date);
        await prisma.dailySignal.upsert({
          where: {
            titleId_date_source_geo: {
              titleId: misspelledTitle.id,
              date: date,
              source: 'WIKIPEDIA',
              geo: 'GLOBAL',
            },
          },
          create: {
            titleId: misspelledTitle.id,
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
      console.log('✓ Inserted Wikipedia signals for misspelled Evil Influencer title\n');
    }
  }

  // Check if Unlocked has any related article we could use
  console.log('Checking Unlocked: A Jail Experiment...');
  const unlockedTitle = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Unlocked', mode: 'insensitive' } },
  });

  if (unlockedTitle) {
    console.log(`Title: ${unlockedTitle.canonicalName}`);
    console.log('No Wikipedia article found - this is expected for newer content.');
    console.log('Signal will come from Google Trends only.\n');
  }

  // Final summary
  console.log('=== Final Polymarket Titles Signal Check ===\n');

  const polyTitles = await prisma.title.findMany({
    where: { externalIds: { some: { provider: 'polymarket' } } },
    include: {
      dailySignals: { distinct: ['source'], select: { source: true } },
    },
  });

  for (const t of polyTitles) {
    const sources = t.dailySignals.map(s => s.source).join(', ') || 'NONE';
    const status = sources === 'NONE' ? '⚠️' : sources.includes('WIKIPEDIA') && sources.includes('TRENDS') ? '✓' : '⚡';
    console.log(`${status} ${t.canonicalName}: ${sources}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
