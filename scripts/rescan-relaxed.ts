/**
 * Rescan script with relaxed parameters to capture more wallets
 */
import { scanInsiders } from '../src/jobs/scanInsiders';
import prisma from '../src/lib/prisma';

async function main() {
  console.log('Starting rescan with relaxed parameters...');
  console.log('  - daysBack: 90');
  console.log('  - minTradeSize: $100');
  console.log('  - maxTrades: 20');
  console.log('');

  try {
    const result = await scanInsiders({
      daysBack: 90,
      minTradeSize: 100,
      maxTrades: 20,
    });

    console.log('\n========== SCAN COMPLETE ==========');
    console.log(`Wallets scanned: ${result.walletsScanned}`);
    console.log(`Wallets qualified: ${result.walletsQualified}`);
    console.log(`Wallets created: ${result.walletsCreated}`);
    console.log(`Wallets updated: ${result.walletsUpdated}`);
    console.log(`Trades recorded: ${result.tradesRecorded}`);
    console.log(`Badges awarded: ${result.badgesAwarded}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\nFirst 5 errors:');
      result.errors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
    }
  } catch (error) {
    console.error('Scan failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
