/**
 * Test Google Trends Ingestion
 *
 * Run with: npx tsx scripts/test-google-trends.ts
 *
 * Options:
 *   --compare "Title1,Title2,Title3"  - Compare specific titles head-to-head
 *   --ingest                          - Run full ingestion for all Polymarket titles
 */

// Load env vars BEFORE any other imports
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function main() {
  // Dynamic imports after env is loaded
  const { ingestGoogleTrends, compareTitlesHead2Head } = await import('../src/jobs/ingestGoogleTrends');
  const prisma = (await import('../src/lib/prisma')).default;

  const args = process.argv.slice(2);
  const compareArg = args.find((a) => a.startsWith('--compare='));
  const shouldIngest = args.includes('--ingest');

  if (compareArg) {
    // Compare specific titles
    const titles = compareArg.replace('--compare=', '').split(',').map((t) => t.trim());
    console.log(`\nComparing titles: ${titles.join(' vs ')}\n`);

    const result = await compareTitlesHead2Head(titles);

    console.log('\n=== Comparison Result ===');
    console.log('Winner:', result.winner);
    console.log('Analysis:', result.analysis);
    console.log('\nDetailed scores:');
    result.comparison.forEach((data, name) => {
      console.log(`  ${name}: US=${data.us}, Global=${data.global}, Trend=${data.trend}`);
    });
  } else if (shouldIngest) {
    // Run full ingestion
    console.log('\nRunning full Google Trends ingestion...\n');
    const result = await ingestGoogleTrends();

    console.log('\n=== Ingestion Summary ===');
    console.log(`Titles processed: ${result.titlesProcessed}`);
    console.log(`Signals saved: ${result.signalsSaved}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.comparisons.length > 0) {
      console.log('\n=== Top Titles by Momentum ===');
      for (const comp of result.comparisons.slice(0, 10)) {
        const trendIcon = comp.trend === 'rising' ? '↑' : comp.trend === 'falling' ? '↓' : '→';
        console.log(
          `  ${comp.name}: US=${comp.avgTrendsUS ?? 'N/A'}, Global=${comp.avgTrendsGlobal ?? 'N/A'} ${trendIcon}`
        );
      }
    }
  } else {
    // Default: Show current trends data from database
    console.log('\n=== Current Google Trends Data in Database ===\n');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const signals = await prisma.dailySignal.findMany({
      where: {
        source: 'TRENDS',
        date: { gte: sevenDaysAgo },
      },
      include: {
        title: { select: { canonicalName: true } },
      },
      orderBy: [{ date: 'desc' }, { value: 'desc' }],
    });

    if (signals.length === 0) {
      console.log('No Google Trends data found in database.');
      console.log('\nRun with --ingest to fetch data, or --compare="Title1,Title2" to compare titles.');
    } else {
      // Group by title
      const byTitle = new Map<string, { us: number[]; global: number[] }>();

      for (const signal of signals) {
        const name = signal.title?.canonicalName || 'Unknown';
        if (!byTitle.has(name)) {
          byTitle.set(name, { us: [], global: [] });
        }
        const data = byTitle.get(name)!;
        if (signal.geo === 'US') {
          data.us.push(signal.value);
        } else {
          data.global.push(signal.value);
        }
      }

      // Calculate averages and display
      const summaries = Array.from(byTitle.entries()).map(([name, data]) => {
        const avgUS = data.us.length > 0 ? Math.round(data.us.reduce((a, b) => a + b, 0) / data.us.length) : null;
        const avgGlobal =
          data.global.length > 0 ? Math.round(data.global.reduce((a, b) => a + b, 0) / data.global.length) : null;
        return { name, avgUS, avgGlobal, dataPoints: data.us.length + data.global.length };
      });

      summaries.sort((a, b) => (b.avgGlobal || 0) - (a.avgGlobal || 0));

      console.log('Titles with Google Trends data (last 7 days):\n');
      for (const summary of summaries) {
        console.log(
          `  ${summary.name}: US=${summary.avgUS ?? 'N/A'}, Global=${summary.avgGlobal ?? 'N/A'} (${summary.dataPoints} data points)`
        );
      }

      console.log(`\nTotal: ${summaries.length} titles, ${signals.length} signals`);
    }

    console.log('\n=== Usage ===');
    console.log('  npx tsx scripts/test-google-trends.ts --ingest');
    console.log('    Fetch fresh Google Trends data for all Polymarket titles');
    console.log('');
    console.log('  npx tsx scripts/test-google-trends.ts --compare="His & Hers,Run Away"');
    console.log('    Compare specific titles head-to-head');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  const prisma = (await import('../src/lib/prisma')).default;
  await prisma.$disconnect();
  process.exit(1);
});
