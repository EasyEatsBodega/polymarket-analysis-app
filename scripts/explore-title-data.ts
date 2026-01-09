/**
 * Explore FlixPatrol data available for a specific title
 * to understand what we can visualize on title detail pages
 */
import axios from 'axios';

const API_KEY = process.env.FLIXPATROL_API_KEY || 'aku_nJHoV46scBZ5bMKzLHDR3P2m';
const BASE = 'https://api.flixpatrol.com/v2';

const api = axios.create({
  baseURL: BASE,
  auth: { username: API_KEY, password: '' },
  headers: { Accept: 'application/json' },
  timeout: 30000,
});

async function exploreTitle(titleName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Exploring FlixPatrol data for: "${titleName}"`);
  console.log('='.repeat(60));

  // 1. Find the title
  console.log('\n1. TITLE SEARCH');
  console.log('-'.repeat(40));
  let titleId: string | null = null;

  try {
    const search = await api.get('/titles', { params: { 'title[eq]': titleName } });
    if (search.data.data?.[0]) {
      const t = search.data.data[0].data;
      titleId = t.id;
      console.log(`Found: ${t.title}`);
      console.log(`  ID: ${t.id}`);
      console.log(`  IMDB: ${t.imdbId}`);
      console.log(`  TMDB: ${t.tmdbId}`);
      console.log(`  Type: ${t.type}`);
      console.log(`  Link: ${t.link}`);
      console.log(`  Full data:`, JSON.stringify(t, null, 2));
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  if (!titleId) {
    console.log('Title not found, stopping');
    return;
  }

  // 2. Get rankings for this title
  console.log('\n2. RANKINGS DATA');
  console.log('-'.repeat(40));
  try {
    const rankings = await api.get('/rankings', {
      params: { 'movie[eq]': titleId },
    });

    if (rankings.data.data?.length > 0) {
      console.log(`Found ${rankings.data.data.length} ranking records`);

      // Group by country
      const byCountry: Record<string, any[]> = {};
      for (const r of rankings.data.data) {
        const d = r.data;
        const country = d.country?.data?.id || 'world';
        if (!byCountry[country]) byCountry[country] = [];
        byCountry[country].push({
          date: d.date?.from || d.date,
          ranking: d.ranking,
          value: d.value,
        });
      }

      console.log(`\nCountries with data: ${Object.keys(byCountry).length}`);
      for (const [country, data] of Object.entries(byCountry).slice(0, 5)) {
        console.log(`  ${country}: ${data.length} records`);
        // Show latest
        const latest = data.sort((a, b) => b.date.localeCompare(a.date))[0];
        console.log(`    Latest: ${latest.date} - Rank #${latest.ranking}, ${latest.value} pts`);
      }

      // Show sample record structure
      console.log('\nSample ranking record:');
      console.log(JSON.stringify(rankings.data.data[0], null, 2));
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  // 3. Check TOP 10 data
  console.log('\n3. TOP 10 DATA');
  console.log('-'.repeat(40));
  try {
    const top10 = await api.get('/top10s', {
      params: { 'movie[eq]': titleId },
    });

    if (top10.data.data?.length > 0) {
      console.log(`Found ${top10.data.data.length} TOP 10 records`);

      // Show sample
      console.log('\nSample TOP 10 record:');
      console.log(JSON.stringify(top10.data.data[0], null, 2));

      // Show latest entries
      console.log('\nLatest TOP 10 entries:');
      for (const entry of top10.data.data.slice(0, 5)) {
        const d = entry.data;
        console.log(
          `  ${d.date?.from}: #${d.ranking} on ${d.company?.data?.name || 'unknown'} (${d.country?.data?.id || 'world'})`
        );
      }
    } else {
      console.log('No TOP 10 data found');
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  // 4. Check fans/social data
  console.log('\n4. FANS/SOCIAL DATA');
  console.log('-'.repeat(40));
  try {
    const fans = await api.get('/fans', {
      params: { 'movie[eq]': titleId },
    });

    if (fans.data.data?.length > 0) {
      console.log(`Found ${fans.data.data.length} fan records`);

      // Show sample
      console.log('\nSample fan record:');
      console.log(JSON.stringify(fans.data.data[0], null, 2));

      // Group by source
      const bySource: Record<string, any[]> = {};
      for (const f of fans.data.data) {
        const d = f.data;
        const source = d.source || 'unknown';
        if (!bySource[source]) bySource[source] = [];
        bySource[source].push({
          date: d.date?.from || d.date,
          value: d.value,
        });
      }

      console.log('\nSocial sources:');
      for (const [source, data] of Object.entries(bySource)) {
        console.log(`  ${source}: ${data.length} records`);
        const latest = data.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        if (latest) {
          console.log(`    Latest: ${latest.date} - ${latest.value?.toLocaleString()}`);
        }
      }
    } else {
      console.log('No fan data found');
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }

  // 5. Check trailers data
  console.log('\n5. TRAILERS DATA');
  console.log('-'.repeat(40));
  try {
    const trailers = await api.get('/trailers', {
      params: { 'movie[eq]': titleId },
    });

    if (trailers.data.data?.length > 0) {
      console.log(`Found ${trailers.data.data.length} trailer records`);
      console.log('\nSample trailer record:');
      console.log(JSON.stringify(trailers.data.data[0], null, 2));
    } else {
      console.log('No trailer data found');
    }
  } catch (e: any) {
    console.log('Error:', e.response?.data || e.message);
  }
}

async function main() {
  // Test with a few titles
  await exploreTitle('Stranger Things');
  await exploreTitle('Run Away');
}

main().catch(console.error);
