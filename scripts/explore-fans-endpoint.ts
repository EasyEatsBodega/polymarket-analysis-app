/**
 * Explore the /fans endpoint (social data)
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
  console.log('Exploring /fans endpoint (Social Data)\n');

  // Get sample data
  const response = await api.get('/fans');
  console.log(`Found ${response.data.data?.length || 0} entries\n`);

  if (response.data.data?.[0]) {
    console.log('Sample entry:');
    console.log(JSON.stringify(response.data.data[0], null, 2));
  }

  // Check OPTIONS for available filters
  console.log('\n--- OPTIONS for /fans ---');
  try {
    const options = await api.options('/fans');
    console.log(JSON.stringify(options.data, null, 2).slice(0, 2000));
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Try to get fans data for Stranger Things
  console.log('\n--- Stranger Things Social Data ---');
  try {
    const stFans = await api.get('/fans', {
      params: { 'movie[eq]': 'ttl_K5H0Bes9dtvkV710raDBpXoK' },
    });
    console.log(`Found ${stFans.data.data?.length || 0} entries`);
    if (stFans.data.data?.slice(0, 3)) {
      for (const entry of stFans.data.data.slice(0, 3)) {
        const d = entry.data;
        console.log(`  ${d.date?.from}: ${d.company?.data?.id} - ${d.value} fans (rank #${d.ranking})`);
      }
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  // Try to get fans data for Run Away
  console.log('\n--- Run Away Social Data ---');
  try {
    const raFans = await api.get('/fans', {
      params: { 'movie[eq]': 'ttl_cql4OjICD0BkFTWeZEXR41y5' },
    });
    console.log(`Found ${raFans.data.data?.length || 0} entries`);
    if (raFans.data.data?.slice(0, 3)) {
      for (const entry of raFans.data.data.slice(0, 3)) {
        const d = entry.data;
        console.log(`  ${d.date?.from}: ${d.company?.data?.id} - ${d.value} fans (rank #${d.ranking})`);
      }
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }
}

main().catch(console.error);
