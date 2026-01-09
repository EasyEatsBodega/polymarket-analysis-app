/**
 * Test RT score fetcher
 */

import { fetchRTScores } from '../src/lib/rottenTomatoes';

async function test() {
  console.log('Testing RT fetcher...\n');

  const titles = ['His & Hers', 'Stranger Things', 'Priscilla', 'Emily in Paris'];

  for (const title of titles) {
    console.log('Fetching: ' + title);
    const scores = await fetchRTScores(title);
    if (scores) {
      console.log('  Tomatometer: ' + (scores.tomatometer ?? 'N/A') + '%');
      console.log('  Audience: ' + (scores.audienceScore ?? 'N/A') + '%');
      console.log('  URL: ' + scores.url);
    } else {
      console.log('  Not found');
    }
    console.log('');
  }
}

test().catch(console.error);
