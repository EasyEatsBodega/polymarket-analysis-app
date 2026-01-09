/**
 * Check Run Away titles - try different search methods
 */
import axios from 'axios';

const API_KEY = 'aku_nJHoV46scBZ5bMKzLHDR3P2m';
const BASE = 'https://api.flixpatrol.com/v2';

const api = axios.create({
  baseURL: BASE,
  auth: { username: API_KEY, password: '' },
  headers: { 'Accept': 'application/json' },
  timeout: 30000,
});

async function searchTitle(query: string) {
  console.log(`\nSearching: "${query}"`);
  try {
    const response = await api.get('/titles', {
      params: { 'title[eq]': query },
    });
    if (response.data.data?.length > 0) {
      for (const item of response.data.data) {
        const t = item.data;
        console.log(`  ✓ ${t.title} (IMDB: ${t.imdbId})`);
      }
      return response.data.data;
    } else {
      console.log('  No results');
    }
  } catch (e: any) {
    console.log('  Error:', e.response?.data || e.message);
  }
  return [];
}

async function main() {
  console.log('Searching for UK drama "Run Away" in FlixPatrol\n');

  // Try different title variations
  await searchTitle('Run Away');
  await searchTitle('Runaway');
  await searchTitle('Run away');

  // Check the title we found earlier (might be different show)
  console.log('\n--- Checking the title ID we found earlier ---');
  try {
    const response = await api.get('/titles/ttl_cql4OjICD0BkFTWeZEXR41y5');
    console.log('Title details:', JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  // Let's also check TOP 10 for recent Netflix entries to see Run Away
  console.log('\n--- Checking recent TOP 10 for Netflix ---');
  try {
    const response = await api.get('/top10s', {
      params: {
        'company[eq]': 'cmp_IA6TdMqwf6kuyQvxo9bJ4nKX', // Netflix
      },
    });

    if (response.data.data) {
      console.log(`Found ${response.data.data.length} TOP 10 entries`);
      // Look for Run Away
      const runAwayEntries = response.data.data.filter((item: any) =>
        item.data?.movie?.data?.title?.toLowerCase().includes('run')
      );
      console.log(`\nEntries containing "run":`);
      for (const entry of runAwayEntries.slice(0, 5)) {
        const d = entry.data;
        console.log(`  ${d.date?.from}: #${d.ranking} - ${d.movie?.data?.title}`);
      }
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }
}

main().catch(console.error);
