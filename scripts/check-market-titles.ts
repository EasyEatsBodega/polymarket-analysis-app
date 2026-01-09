import prisma from '../src/lib/prisma';

async function main() {
  // Get all markets and their linked titles
  const markets = await prisma.polymarketMarket.findMany({
    include: {
      titleLinks: {
        include: {
          title: {
            select: { id: true, canonicalName: true, imdbRating: true }
          }
        }
      }
    }
  });

  console.log('=== POLYMARKET MARKETS AND LINKED TITLES ===\n');

  for (const market of markets) {
    console.log(`Market: ${market.question}`);
    console.log(`  Outcomes: ${(market.outcomes as string[]).join(', ')}`);
    console.log(`  Linked titles (${market.titleLinks.length}):`);
    for (const link of market.titleLinks) {
      console.log(`    - ${link.title.canonicalName} (IMDB: ${link.title.imdbRating ?? 'none'})`);
    }
    console.log('');
  }

  // Also check titles that appear on the Netflix page
  console.log('\n=== TITLES FROM SCREENSHOT ===');
  const screenshotTitles = [
    'Stranger Things 5',
    'Run Away',
    'Emily in Paris',
    'His & Hers',
    '11.22.63',
    'Unlocked'
  ];

  for (const name of screenshotTitles) {
    const title = await prisma.title.findFirst({
      where: { canonicalName: { contains: name, mode: 'insensitive' } },
      select: { id: true, canonicalName: true, imdbRating: true, marketLinks: { select: { id: true } } }
    });
    if (title) {
      console.log(`${title.canonicalName}: IMDB ${title.imdbRating ?? 'none'}, Polymarket linked: ${title.marketLinks.length > 0}`);
    } else {
      console.log(`${name}: NOT FOUND`);
    }
  }

  await prisma.$disconnect();
}
main();
