import prisma from '../src/lib/prisma';

async function main() {
  const total = await prisma.title.count();
  const withRatings = await prisma.title.count({ where: { imdbRating: { not: null } } });
  const withRT = await prisma.title.count({ where: { rtCriticScore: { not: null } } });
  console.log('Total titles:', total);
  console.log('With IMDB rating:', withRatings);
  console.log('With RT score:', withRT);
  await prisma.$disconnect();
}
main();
