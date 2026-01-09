/**
 * Find the correct social/popularity endpoint names
 */
import axios from 'axios';

const API_KEY = 'aku_nJHoV46scBZ5bMKzLHDR3P2m';
const BASE = 'https://api.flixpatrol.com/v2';

const api = axios.create({
  baseURL: BASE,
  auth: { username: API_KEY, password: '' },
  headers: { 'Accept': 'application/json' },
  timeout: 15000,
});

async function tryEndpoint(path: string) {
  try {
    const response = await api.get(path);
    console.log(`✓ ${path} - Status ${response.status}`);
    if (response.data.data?.[0]) {
      console.log(`  Keys: ${Object.keys(response.data.data[0].data || response.data.data[0]).slice(0, 8).join(', ')}`);
    }
    return true;
  } catch (e: any) {
    const msg = e.response?.data?.error?.message || e.response?.status || e.message;
    console.log(`✗ ${path} - ${msg}`);
    return false;
  }
}

async function main() {
  console.log('Finding Social/Popularity endpoints\n');

  // Try various endpoint names based on the API docs
  const endpoints = [
    // Social
    '/social',
    '/social-fans',
    '/socialfans',
    '/fans',
    '/social-views',
    '/socialviews',

    // Popularity
    '/popularity',
    '/popularity-databases',
    '/popularitydatabases',
    '/databases',
    '/imdb',
    '/tmdb',

    // Other potential endpoints
    '/trailers',
    '/trailer-views',
    '/wikipedia',
    '/persons',
    '/premieres',
    '/calendar',
  ];

  for (const endpoint of endpoints) {
    await tryEndpoint(endpoint);
    await new Promise(r => setTimeout(r, 300));
  }

  // Also try OPTIONS on root to see all available endpoints
  console.log('\n--- Checking root OPTIONS ---');
  try {
    const response = await api.options('/');
    console.log('Root OPTIONS:', JSON.stringify(response.data, null, 2).slice(0, 1500));
  } catch (e: any) {
    console.log('Root OPTIONS error:', e.message);
  }
}

main().catch(console.error);
