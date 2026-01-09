/**
 * List titles that need Google Trends backfill
 */

import prisma from '../src/lib/prisma';

async function main() {
  const titles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } },
    },
    select: { canonicalName: true },
    orderBy: { canonicalName: 'asc' },
  });

  console.log('='.repeat(60));
  console.log('Titles for Google Trends Backfill (Past 30 Days)');
  console.log('='.repeat(60));
  console.log('');

  for (const t of titles) {
    const slug = t.canonicalName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    console.log(`${t.canonicalName}`);
    console.log(`  → ${slug}_us.csv, ${slug}_global.csv`);
  }

  console.log('');
  console.log(`Total: ${titles.length} titles`);
  console.log('');
  console.log('Instructions:');
  console.log('1. Go to https://trends.google.com/trends/explore');
  console.log('2. Search for each title name');
  console.log('3. Set time range to "Past 90 days"');
  console.log('4. For US: Set location to "United States"');
  console.log('5. For Global: Set location to "Worldwide"');
  console.log('6. Click download (↓) and rename file');
  console.log('7. Save to: trends-data/ folder');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
