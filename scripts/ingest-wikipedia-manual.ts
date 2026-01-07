/**
 * Manual Wikipedia ingestion with correct date handling
 *
 * Wikipedia API only has data up to ~2 days ago from real-world time.
 * Since the system date shows 2026, but real data only exists up to actual today,
 * we need to use a valid date for ingestion.
 */
import prisma from '../src/lib/prisma';
import { getActiveTitlesForSignals } from '../src/jobs/ingestDailySignals';
import axios from 'axios';

const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

async function fetchWikipediaViews(titleName: string, dateStr: string): Promise<number | null> {
  const articleTitle = titleName
    .replace(/\s+/g, '_')
    .replace(/['"]/g, '');

  const suffixes = ['', '_(TV_series)', '_(film)', '_(miniseries)', '_(Netflix_film)', '_(Netflix_series)'];

  for (const suffix of suffixes) {
    try {
      const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle + suffix)}/daily/${dateStr}/${dateStr}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'PredictEasy/1.0 (netflix-analysis)',
        },
        timeout: 10000,
      });

      const items = response.data?.items;
      if (items && items.length > 0) {
        return items[0].views;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function main() {
  // Use a date that actually has Wikipedia data
  // January 1, 2025 should have data
  const targetDate = new Date('2025-01-05');
  const dateStr = '20250105';

  console.log(`Ingesting Wikipedia data for date: ${targetDate.toISOString().split('T')[0]}\n`);

  const titles = await getActiveTitlesForSignals();
  console.log(`Found ${titles.length} active titles\n`);

  let successCount = 0;
  let failCount = 0;

  // Process first 30 titles as a test
  const titlesToProcess = titles.slice(0, 30);

  for (const title of titlesToProcess) {
    const views = await fetchWikipediaViews(title.canonicalName, dateStr);

    if (views !== null) {
      // Save to database
      await prisma.dailySignal.upsert({
        where: {
          titleId_date_source_geo: {
            titleId: title.id,
            date: targetDate,
            source: 'WIKIPEDIA',
            geo: 'GLOBAL',
          },
        },
        create: {
          titleId: title.id,
          date: targetDate,
          source: 'WIKIPEDIA',
          geo: 'GLOBAL',
          value: views,
        },
        update: {
          value: views,
        },
      });

      console.log(`✅ ${title.canonicalName}: ${views.toLocaleString()} views`);
      successCount++;
    } else {
      console.log(`❌ ${title.canonicalName}: No Wikipedia article found`);
      failCount++;
    }

    // Small delay to be nice to Wikipedia API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  // Verify data was saved
  const savedCount = await prisma.dailySignal.count({
    where: {
      source: 'WIKIPEDIA',
      date: targetDate,
    }
  });
  console.log(`Signals saved to DB: ${savedCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);
