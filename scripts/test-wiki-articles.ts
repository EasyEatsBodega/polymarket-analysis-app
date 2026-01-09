import axios from 'axios';

async function test() {
  const tests = [
    'Evil_Influencer:_The_Jodi_Hildebrandt_Story',
    'Jodi_Hildebrandt',
    'Ruby_Franke',
    'Unlocked:_A_Jail_Experiment_(TV_series)',
    'Jailbirds_(TV_series)',
  ];

  console.log('Testing Wikipedia article names:\n');

  for (const article of tests) {
    try {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/20260101/20260107`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'PredictEasy/1.0' }, timeout: 10000 });
      const views = res.data?.items?.slice(0, 3).map((i: { views: number }) => i.views) || [];
      console.log(`✓ ${article}: ${views.join(', ')} views`);
    } catch (e: any) {
      console.log(`✗ ${article}: NOT FOUND`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

test();
