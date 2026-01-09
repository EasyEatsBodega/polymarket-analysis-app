import prisma from '../src/lib/prisma';

async function main() {
  // Get titles that have Polymarket market links
  const polymarketTitles = await prisma.title.findMany({
    where: {
      marketLinks: {
        some: {}
      }
    },
    select: {
      id: true,
      canonicalName: true,
      imdbRating: true,
      rtCriticScore: true,
      ratingsUpdatedAt: true,
    }
  });
  
  const withRatings = polymarketTitles.filter(t => t.imdbRating !== null);
  const withoutRatings = polymarketTitles.filter(t => t.imdbRating === null);
  
  console.log('Polymarket-linked titles:', polymarketTitles.length);
  console.log('With ratings:', withRatings.length);
  console.log('Without ratings:', withoutRatings.length);
  console.log('\nTitles needing ratings:');
  withoutRatings.forEach(t => console.log(`  - ${t.canonicalName}`));
  
  await prisma.$disconnect();
}
main();
