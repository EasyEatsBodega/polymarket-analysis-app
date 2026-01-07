/**
 * Test Wikipedia API fetching
 */
import axios from 'axios';

const WIKIPEDIA_API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

async function fetchWikipediaViews(titleName: string, date: Date): Promise<number | null> {
  // Format the title for Wikipedia API (replace spaces with underscores)
  const articleTitle = titleName
    .replace(/\s+/g, '_')
    .replace(/['"]/g, ''); // Remove quotes

  // Format date for Wikipedia API (YYYYMMDD)
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

  // Try both TV series and film article formats
  const suffixes = ['', '_(TV_series)', '_(film)', '_(miniseries)'];

  for (const suffix of suffixes) {
    try {
      const url = `${WIKIPEDIA_API_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle + suffix)}/daily/${dateStr}/${dateStr}`;
      console.log(`Trying: ${articleTitle}${suffix}`);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'PredictEasy/1.0 (netflix-analysis; contact@example.com)',
        },
        timeout: 10000,
      });

      const items = response.data?.items;
      if (items && items.length > 0) {
        console.log(`  ✅ Found! Views: ${items[0].views}`);
        return items[0].views;
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`  ❌ 404 - article not found`);
      } else {
        console.log(`  ❌ Error: ${error.message}`);
      }
      continue;
    }
  }

  return null;
}

async function main() {
  // Wikipedia has ~2-day data lag, use date from 3-5 days ago
  const testDate = new Date();
  testDate.setDate(testDate.getDate() - 5);
  console.log(`Testing Wikipedia API for date: ${testDate.toISOString().split('T')[0]}\n`);
  const yesterday = testDate;

  const testTitles = [
    'Squid Game',
    'Stranger Things',
    'Wednesday',
    'The Night Agent',
    'Black Doves',
  ];

  for (const title of testTitles) {
    console.log(`\n=== ${title} ===`);
    const views = await fetchWikipediaViews(title, yesterday);
    if (views === null) {
      console.log('  ⚠️ No data found with any suffix');
    }
  }
}

main().catch(console.error);
