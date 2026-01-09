/**
 * Explore FlixPatrol API v2 endpoints
 * Testing with limited calls to understand data structure
 */
import axios from 'axios';

const API_KEY = 'aku_nJHoV46scBZ5bMKzLHDR3P2m';

// Try different base URL patterns
const BASE_URLS = [
  'https://flixpatrol.com/api2',
  'https://api.flixpatrol.com',
  'https://flixpatrol.com/api',
];

async function testEndpoint(baseUrl: string, path: string, params?: Record<string, string>) {
  const fullUrl = `${baseUrl}${path}`;
  console.log(`Testing: ${fullUrl}`);

  try {
    // Try different auth methods
    const response = await axios.get(fullUrl, {
      params: { ...params, api_key: API_KEY },
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      timeout: 15000,
    });

    console.log('  ✓ Status:', response.status);

    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
      console.log('  → HTML response (not API)');
      return null;
    }

    if (Array.isArray(response.data)) {
      console.log('  → Array with', response.data.length, 'items');
      if (response.data[0]) {
        console.log('  → Keys:', Object.keys(response.data[0]).slice(0, 10).join(', '));
      }
    } else if (typeof response.data === 'object') {
      console.log('  → Object keys:', Object.keys(response.data).slice(0, 10).join(', '));
    }

    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 401) {
      console.log('  ✗ 401 Unauthorized');
    } else if (status === 404) {
      console.log('  ✗ 404 Not Found');
    } else {
      console.log('  ✗ Error:', status || error.message);
    }
    return null;
  }
}

async function main() {
  console.log('FlixPatrol API v2 Discovery');
  console.log('===========================\n');

  // Correct base URL: https://api.flixpatrol.com/v2/
  const BASE = 'https://api.flixpatrol.com/v2';

  const endpoints = [
    { path: '/rankings', desc: 'Rankings (global aggregated)' },
    { path: '/top10s', desc: 'TOP 10s (daily)' },
    { path: '/titles', desc: 'Titles database' },
    { path: '/hours-viewed', desc: 'Netflix Hours Viewed' },
    { path: '/popularity-databases', desc: 'Popularity scores (IMDb, TMDB, etc)' },
    { path: '/social-fans', desc: 'Social engagement' },
  ];

  console.log('Using HTTP Basic Auth with API key...\n');

  for (const { path, desc } of endpoints) {
    const url = `${BASE}${path}`;
    console.log(`\n=== ${desc} ===`);
    console.log(`GET ${url}`);

    try {
      const response = await axios.get(url, {
        auth: { username: API_KEY, password: '' },
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      });

      console.log('✓ Status:', response.status);

      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
        console.log('→ HTML response (redirect to web?)');
      } else if (Array.isArray(response.data)) {
        console.log('→ Array:', response.data.length, 'items');
        if (response.data[0]) {
          console.log('→ Keys:', Object.keys(response.data[0]).join(', '));
          console.log('→ Sample:', JSON.stringify(response.data[0], null, 2).slice(0, 400));
        }
      } else if (typeof response.data === 'object') {
        console.log('→ Keys:', Object.keys(response.data).join(', '));
        console.log('→ Data:', JSON.stringify(response.data, null, 2).slice(0, 400));
      }
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      if (status === 401) {
        console.log('✗ 401 Unauthorized');
      } else if (status === 404) {
        console.log('✗ 404 Not Found');
      } else if (status === 403) {
        console.log('✗ 403 Forbidden');
      } else {
        console.log('✗ Error:', status || error.message);
        if (data) console.log('  Response:', JSON.stringify(data).slice(0, 200));
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n===========================');
  console.log('Discovery complete.');
}

main().catch(console.error);
