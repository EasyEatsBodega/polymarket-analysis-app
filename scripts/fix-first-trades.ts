/**
 * Fix First Trade Dates Script
 *
 * Scans all InsiderWallets and corrects firstTradeAt dates by fetching
 * the wallet's full trade history from Polymarket API.
 *
 * Usage: npx tsx scripts/fix-first-trades.ts [--dry-run]
 */
import prisma from '../src/lib/prisma';
import { fetchTradesByWallet } from '../src/lib/polymarketClient';

interface FixResult {
  walletsChecked: number;
  walletsFixed: number;
  walletsFailed: number;
  errors: string[];
}

const RATE_LIMIT_DELAY_MS = 250; // Delay between API calls to avoid rate limiting

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fixFirstTrades(dryRun = false): Promise<FixResult> {
  const result: FixResult = {
    walletsChecked: 0,
    walletsFixed: 0,
    walletsFailed: 0,
    errors: [],
  };

  console.log('========================================');
  console.log('  Fix First Trade Dates');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('========================================\n');

  // Get all insider wallets
  const wallets = await prisma.insiderWallet.findMany({
    select: {
      id: true,
      address: true,
      firstTradeAt: true,
      totalTrades: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${wallets.length} wallets to check\n`);

  for (const wallet of wallets) {
    result.walletsChecked++;
    const shortAddr = wallet.address.slice(0, 8) + '...';

    try {
      // Fetch full trade history from Polymarket API
      const fullHistory = await fetchTradesByWallet(wallet.address);

      if (fullHistory.length === 0) {
        console.log(`  ⚠️  ${shortAddr} - No trades found in API`);
        continue;
      }

      // Calculate actual first trade date
      const allTimestamps = fullHistory.map((t) => t.timestamp * 1000); // Unix to ms
      const actualFirstTradeAt = new Date(Math.min(...allTimestamps));

      // Compare with stored value
      const storedDate = wallet.firstTradeAt.toISOString().split('T')[0];
      const actualDate = actualFirstTradeAt.toISOString().split('T')[0];

      if (storedDate !== actualDate) {
        const daysDiff = Math.round(
          (wallet.firstTradeAt.getTime() - actualFirstTradeAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        console.log(`  📅 ${shortAddr} - ${storedDate} → ${actualDate} (${daysDiff > 0 ? '+' : ''}${daysDiff} days off)`);

        if (!dryRun) {
          await prisma.insiderWallet.update({
            where: { id: wallet.id },
            data: {
              firstTradeAt: actualFirstTradeAt,
              totalTrades: fullHistory.length, // Also update total trades while we're at it
            },
          });
        }

        result.walletsFixed++;
      } else {
        console.log(`  ✓  ${shortAddr} - ${storedDate} (correct)`);
      }

      // Rate limiting
      await sleep(RATE_LIMIT_DELAY_MS);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${shortAddr} - Error: ${errorMsg}`);
      result.walletsFailed++;
      result.errors.push(`${wallet.address}: ${errorMsg}`);
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    const result = await fixFirstTrades(dryRun);

    console.log('\n========================================');
    console.log('  SUMMARY');
    console.log('========================================');
    console.log(`  Wallets checked: ${result.walletsChecked}`);
    console.log(`  Wallets fixed:   ${result.walletsFixed}`);
    console.log(`  Wallets failed:  ${result.walletsFailed}`);

    if (dryRun && result.walletsFixed > 0) {
      console.log(`\n  Run without --dry-run to apply ${result.walletsFixed} fix(es)`);
    }

    if (result.errors.length > 0) {
      console.log(`\n  Errors:`);
      result.errors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
      if (result.errors.length > 10) {
        console.log(`    ... and ${result.errors.length - 10} more`);
      }
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
