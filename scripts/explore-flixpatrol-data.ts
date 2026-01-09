/**
 * Explore FlixPatrol API data structure
 * Focus on the endpoints we have access to
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
  console.log('FlixPatrol API Data Exploration');
  console.log('================================\n');

  // 1. Check what filters are available for rankings
  console.log('=== 1. Fetching Netflix TV Rankings ===');
  try {
    // Try to filter by Netflix and TV shows
    const rankings = await api.get('/rankings', {
      params: {
        'service[eq]': 'netflix',
        'type[eq]': 2, // 2 = TV Show based on docs
      },
    });

    console.log('Status:', rankings.status);
    console.log('Total items in response:', rankings.data.data?.length || 0);

    if (rankings.data.data && rankings.data.data[0]) {
      const sample = rankings.data.data[0].data;
      console.log('\nSample ranking item:');
      console.log(JSON.stringify(sample, null, 2).slice(0, 1000));
    }
  } catch (error: any) {
    console.log('Error:', error.response?.data || error.message);
  }

  await new Promise(r => setTimeout(r, 1000));

  // 2. Look at TOP 10s structure
  console.log('\n=== 2. Fetching TOP 10s Data ===');
  try {
    const top10s = await api.get('/top10s');

    console.log('Status:', top10s.status);

    if (top10s.data.data && top10s.data.data[0]) {
      const sample = top10s.data.data[0].data;
      console.log('\nSample TOP 10 item:');
      console.log(JSON.stringify(sample, null, 2).slice(0, 1200));
    }
  } catch (error: any) {
    console.log('Error:', error.response?.data || error.message);
  }

  await new Promise(r => setTimeout(r, 1000));

  // 3. Search for specific title
  console.log('\n=== 3. Searching for "Stranger Things" ===');
  try {
    const titles = await api.get('/titles', {
      params: {
        'title[eq]': 'Stranger Things',
      },
    });

    console.log('Status:', titles.status);
    console.log('Results:', titles.data.data?.length || 0);

    if (titles.data.data) {
      for (const item of titles.data.data.slice(0, 3)) {
        console.log('\nTitle:', item.data?.title);
        console.log('ID:', item.data?.id);
        console.log('Link:', item.data?.link);
      }
    }
  } catch (error: any) {
    console.log('Error:', error.response?.data || error.message);
  }

  // 4. Try to find available query parameters via OPTIONS
  console.log('\n=== 4. Checking OPTIONS for /rankings ===');
  try {
    const options = await api.options('/rankings');
    console.log('OPTIONS response:', JSON.stringify(options.data, null, 2).slice(0, 1500));
  } catch (error: any) {
    console.log('OPTIONS not available or error:', error.message);
  }

  console.log('\n================================');
  console.log('Used ~4 API calls');
}

main().catch(console.error);
