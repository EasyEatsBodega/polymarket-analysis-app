/**
 * Get historical rankings for a specific title from FlixPatrol
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

async function main() {
  console.log('FlixPatrol - Get Title Rankings');
  console.log('================================\n');

  // First, find the title ID for a show we care about
  const searchTitles = ['Stranger Things', 'His and Hers', 'Run Away'];

  for (const searchTitle of searchTitles) {
    console.log(`\n=== Searching for "${searchTitle}" ===`);

    try {
      // Search for title
      const titleSearch = await api.get('/titles', {
        params: { 'title[eq]': searchTitle },
      });

      if (!titleSearch.data.data || titleSearch.data.data.length === 0) {
        // Try contains search
        const containsSearch = await api.get('/titles', {
          params: { 'title[like]': `%${searchTitle}%` },
        });

        if (containsSearch.data.data?.length > 0) {
          console.log('Found with LIKE search:');
          for (const t of containsSearch.data.data.slice(0, 3)) {
            console.log(`  - ${t.data?.title} (${t.data?.id})`);
          }
        } else {
          console.log('Not found');
        }
        continue;
      }

      const title = titleSearch.data.data[0].data;
      console.log(`Found: ${title.title}`);
      console.log(`ID: ${title.id}`);
      console.log(`IMDB: ${title.imdbId}, TMDB: ${title.tmdbId}`);

      // Now get rankings for this title
      console.log('\nFetching rankings...');
      const rankings = await api.get('/rankings', {
        params: { 'movie[eq]': title.id },
      });

      if (rankings.data.data && rankings.data.data.length > 0) {
        console.log(`Found ${rankings.data.data.length} ranking records`);

        // Show first 5 rankings
        for (const r of rankings.data.data.slice(0, 5)) {
          const d = r.data;
          console.log(`  ${d.date?.from}: Rank #${d.ranking}, ${d.value} pts (${d.country?.data?.id})`);
        }
      } else {
        console.log('No rankings found');
      }
    } catch (error: any) {
      console.log('Error:', error.response?.data || error.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Also check what companies (streaming services) are available
  console.log('\n=== Available Streaming Services ===');
  try {
    const companies = await api.get('/companies');
    if (companies.data.data) {
      console.log(`Found ${companies.data.data.length} companies`);
      // Find Netflix
      for (const c of companies.data.data) {
        if (c.data?.name?.toLowerCase().includes('netflix')) {
          console.log(`Netflix ID: ${c.data.id} - ${c.data.name}`);
        }
      }
    }
  } catch (error: any) {
    console.log('Companies endpoint:', error.response?.data || error.message);
  }

  console.log('\n================================');
}

main().catch(console.error);
