/**
 * Regenerate forecasts with Wikipedia data
 */
import { generateForecastsJob } from '../src/jobs/generateForecasts';

async function main() {
  console.log('Regenerating forecasts with Wikipedia data...');
  try {
    const result = await generateForecastsJob();
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
