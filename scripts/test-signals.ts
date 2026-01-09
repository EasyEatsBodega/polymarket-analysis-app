import { getActiveTitlesForSignals, ingestSignalsForTitles } from '../src/jobs/ingestDailySignals';

async function run() {
  console.log('Getting active titles...');
  const titles = await getActiveTitlesForSignals();
  console.log(`Active titles: ${titles.length}`);
  console.log('First 5:', titles.slice(0, 5).map(t => t.canonicalName));

  // Process first 5 titles as a test
  console.log('\nProcessing first 5 titles...');
  const result = await ingestSignalsForTitles(titles.slice(0, 5));
  console.log('Result:', JSON.stringify(result, null, 2));
}

run()
  .catch(console.error)
  .finally(() => process.exit(0));
