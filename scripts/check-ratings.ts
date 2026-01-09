/**
 * Check ratings data in database
 */

import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== Checking Ratings Data ===\n');

  const polymarketTitles = await prisma.title.findMany({
    where: { externalIds: { some: { provider: 'polymarket' } } },
    select: {
      id: true,
      canonicalName: true,
      imdbId: true,
      imdbRating: true,
      imdbVotes: true,
      rtCriticScore: true,
      metascore: true,
      rated: true,
      ratingsUpdatedAt: true,
    },
  });

  console.log('Found ' + polymarketTitles.length + ' Polymarket titles\n');

  for (const t of polymarketTitles) {
    console.log(t.canonicalName);
    console.log('  IMDB ID: ' + (t.imdbId || 'N/A'));
    console.log('  IMDB Rating: ' + (t.imdbRating || 'N/A') + ' (' + (t.imdbVotes?.toLocaleString() || 0) + ' votes)');
    console.log('  RT Critic: ' + (t.rtCriticScore !== null ? t.rtCriticScore + '%' : 'N/A'));
    console.log('  Metascore: ' + (t.metascore || 'N/A'));
    console.log('');
  }

  const withIMDB = polymarketTitles.filter((t) => t.imdbRating !== null);
  const withRT = polymarketTitles.filter((t) => t.rtCriticScore !== null);
  const withMeta = polymarketTitles.filter((t) => t.metascore !== null);

  console.log('=== Summary ===');
  console.log('With IMDB Rating: ' + withIMDB.length + '/' + polymarketTitles.length);
  console.log('With RT Score: ' + withRT.length + '/' + polymarketTitles.length);
  console.log('With Metascore: ' + withMeta.length + '/' + polymarketTitles.length);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
