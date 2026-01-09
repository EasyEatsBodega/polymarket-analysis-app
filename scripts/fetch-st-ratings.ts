import prisma from '../src/lib/prisma';
import { searchOMDB } from '../src/lib/omdb';

async function main() {
  // Search for base "Stranger Things" which will get the main series
  const ratings = await searchOMDB('Stranger Things', 'series');
  console.log('OMDB Result:', JSON.stringify(ratings, null, 2));
  
  if (ratings) {
    // Update all Stranger Things titles with the same ratings
    const result = await prisma.title.updateMany({
      where: { canonicalName: { contains: 'Stranger Things', mode: 'insensitive' } },
      data: {
        imdbId: ratings.imdbId,
        imdbRating: ratings.imdbRating,
        imdbVotes: ratings.imdbVotes,
        rtCriticScore: ratings.rtCriticScore,
        metascore: ratings.metascore,
        rated: ratings.rated,
        ratingsUpdatedAt: new Date(),
      }
    });
    console.log(`Updated ${result.count} Stranger Things titles`);
  }
  
  await prisma.$disconnect();
}
main();
