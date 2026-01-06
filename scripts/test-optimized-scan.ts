/**
 * Test the optimized scan with tight limits
 */
import { scanInsiders } from '../src/jobs/scanInsiders';
import prisma from '../src/lib/prisma';

async function test() {
  console.log('Testing optimized scan with tight limits...\n');
  const start = Date.now();

  const result = await scanInsiders({
    daysBack: 30,
    maxTradesToScan: 5000,
    maxNewWallets: 10,
    maxTotalTrades: 50,
    maxExistingUpdates: 5,
    timeoutMs: 120000, // 2 min timeout for test
  });

  const duration = (Date.now() - start) / 1000;
  console.log('');
  console.log('=== TEST RESULTS ===');
  console.log(`Duration: ${duration.toFixed(1)}s`);
  console.log(`Wallets scanned: ${result.walletsScanned}`);
  console.log(`Wallets qualified: ${result.walletsQualified}`);
  console.log(`Created: ${result.walletsCreated}`);
  console.log(`Updated: ${result.walletsUpdated}`);
  console.log(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\nFirst 3 errors:');
    result.errors.slice(0, 3).forEach((e) => console.log(`  - ${e}`));
  }

  await prisma.$disconnect();
}

test().catch(console.error);
