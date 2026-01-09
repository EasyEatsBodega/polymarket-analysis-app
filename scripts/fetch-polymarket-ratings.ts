import prisma from '../src/lib/prisma';
import { searchOMDB } from '../src/lib/omdb';

async function main() {
  // Get Polymarket-linked titles without ratings
  const titles = await prisma.title.findMany({
    where: {
      marketLinks: { some: {} },
      imdbRating: null,
    },
    select: { id: true, canonicalName: true, type: true }
  });

  console.log(`Fetching ratings for ${titles.length} Polymarket titles...\n`);

  for (const title of titles) {
    const type = title.type === 'SHOW' ? 'series' : 'movie';
    console.log(`${title.canonicalName} (${type})`);

    const ratings = await searchOMDB(title.canonicalName, type);

    if (ratings && ratings.imdbRating) {
      await prisma.title.update({
        where: { id: title.id },
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
      console.log(`  ✅ IMDB: ${ratings.imdbRating}/10 | RT: ${ratings.rtCriticScore ?? 'N/A'}%\n`);
    } else {
      // Mark as checked
      await prisma.title.update({
        where: { id: title.id },
        data: { ratingsUpdatedAt: new Date() }
      });
      console.log(`  ❌ Not found\n`);
    }
  }

  await prisma.$disconnect();
}
main();
