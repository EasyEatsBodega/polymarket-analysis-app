/**
 * Wikipedia ingestion with 7-day trending data
 *
 * Fetches Wikipedia pageviews for the past 7 days and calculates:
 * - Average daily views
 * - 3-day vs 7-day comparison (momentum)
 * - Week-over-week growth rate
 */
import prisma from '../src/lib/prisma';
import { getActiveTitlesForSignals } from '../src/jobs/ingestDailySignals';
import axios from 'axios';

const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

interface WikiTrendData {
  titleName: string;
  articleFound: string | null;
  dailyViews: { date: string; views: number }[];
  avg7Day: number;
  avg3Day: number;
  momentum: number; // (3day avg / 7day avg) - 1, positive = growing
  totalViews: number;
}

async function fetchWikipediaRange(titleName: string, startDate: string, endDate: string): Promise<{ article: string; views: { date: string; views: number }[] } | null> {
  const articleTitle = titleName
    .replace(/\s+/g, '_')
    .replace(/['"]/g, '');

  const suffixes = ['', '_(TV_series)', '_(film)', '_(miniseries)', '_(Netflix_film)', '_(Netflix_series)'];

  for (const suffix of suffixes) {
    try {
      const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle + suffix)}/daily/${startDate}/${endDate}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'PredictEasy/1.0 (netflix-analysis)',
        },
        timeout: 10000,
      });

      const items = response.data?.items;
      if (items && items.length > 0) {
        return {
          article: articleTitle + suffix,
          views: items.map((item: any) => ({
            date: item.timestamp.slice(0, 8), // YYYYMMDD
            views: item.views,
          })),
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function calculateTrendData(titleName: string, data: { article: string; views: { date: string; views: number }[] } | null): WikiTrendData {
  if (!data || data.views.length === 0) {
    return {
      titleName,
      articleFound: null,
      dailyViews: [],
      avg7Day: 0,
      avg3Day: 0,
      momentum: 0,
      totalViews: 0,
    };
  }

  // Sort by date
  const sortedViews = [...data.views].sort((a, b) => a.date.localeCompare(b.date));

  // Calculate averages
  const totalViews = sortedViews.reduce((sum, d) => sum + d.views, 0);
  const avg7Day = totalViews / sortedViews.length;

  // Last 3 days (most recent)
  const last3Days = sortedViews.slice(-3);
  const avg3Day = last3Days.reduce((sum, d) => sum + d.views, 0) / last3Days.length;

  // Momentum: how much recent (3-day) differs from overall (7-day)
  const momentum = avg7Day > 0 ? (avg3Day / avg7Day) - 1 : 0;

  return {
    titleName,
    articleFound: data.article,
    dailyViews: sortedViews,
    avg7Day: Math.round(avg7Day),
    avg3Day: Math.round(avg3Day),
    momentum: Math.round(momentum * 100) / 100, // Round to 2 decimal places
    totalViews,
  };
}

async function main() {
  // Use January 2025 date range (7 days)
  const endDate = '20250105';
  const startDate = '20241230'; // 7 days before

  console.log(`Fetching Wikipedia data from ${startDate} to ${endDate}\n`);

  const titles = await getActiveTitlesForSignals();
  console.log(`Found ${titles.length} active titles\n`);

  const results: WikiTrendData[] = [];

  // Process all titles
  const titlesToProcess = titles;

  for (const title of titlesToProcess) {
    const data = await fetchWikipediaRange(title.canonicalName, startDate, endDate);
    const trendData = calculateTrendData(title.canonicalName, data);
    results.push(trendData);

    if (trendData.articleFound) {
      const momentumStr = trendData.momentum > 0 ? `📈 +${(trendData.momentum * 100).toFixed(0)}%` :
                          trendData.momentum < 0 ? `📉 ${(trendData.momentum * 100).toFixed(0)}%` : '➡️ 0%';
      console.log(`✅ ${title.canonicalName}`);
      console.log(`   Article: ${trendData.articleFound}`);
      console.log(`   7-day avg: ${trendData.avg7Day.toLocaleString()} | 3-day avg: ${trendData.avg3Day.toLocaleString()} | ${momentumStr}`);

      // Save ALL days' data to database for historical tracking
      for (const dayData of trendData.dailyViews) {
        const dateObj = new Date(
          parseInt(dayData.date.slice(0, 4)),
          parseInt(dayData.date.slice(4, 6)) - 1,
          parseInt(dayData.date.slice(6, 8))
        );

        await prisma.dailySignal.upsert({
          where: {
            titleId_date_source_geo: {
              titleId: title.id,
              date: dateObj,
              source: 'WIKIPEDIA',
              geo: 'GLOBAL',
            },
          },
          create: {
            titleId: title.id,
            date: dateObj,
            source: 'WIKIPEDIA',
            geo: 'GLOBAL',
            value: dayData.views,
          },
          update: {
            value: dayData.views,
          },
        });
      }
      console.log(`   Saved ${trendData.dailyViews.length} days of data`);
    } else {
      console.log(`❌ ${title.canonicalName}: No article found`);
    }

    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Top Titles by Momentum ===`);
  const withData = results.filter(r => r.articleFound);
  const sortedByMomentum = withData.sort((a, b) => b.momentum - a.momentum);

  console.log('\n📈 Growing (positive momentum):');
  sortedByMomentum.slice(0, 5).forEach(r => {
    console.log(`  ${r.titleName}: ${(r.momentum * 100).toFixed(0)}% (${r.avg3Day.toLocaleString()} vs ${r.avg7Day.toLocaleString()} avg)`);
  });

  console.log('\n📉 Declining (negative momentum):');
  sortedByMomentum.slice(-5).reverse().forEach(r => {
    console.log(`  ${r.titleName}: ${(r.momentum * 100).toFixed(0)}% (${r.avg3Day.toLocaleString()} vs ${r.avg7Day.toLocaleString()} avg)`);
  });

  console.log(`\n=== Summary ===`);
  console.log(`Found Wikipedia data: ${withData.length}/${titlesToProcess.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
