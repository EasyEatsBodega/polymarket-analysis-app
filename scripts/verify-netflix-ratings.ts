import prisma from '../src/lib/prisma';

async function main() {
  const titles = [
    'Stranger Things',
    'Run Away',
    'Emily in Paris',
    'His & Hers',
    '11.22.63',
    'Unlocked'
  ];

  console.log('=== Netflix Polymarket Title Ratings ===\n');

  for (const name of titles) {
    const title = await prisma.title.findFirst({
      where: { canonicalName: { contains: name, mode: 'insensitive' } },
      select: { canonicalName: true, imdbRating: true, rtCriticScore: true, metascore: true, rated: true }
    });
    if (title) {
      const imdb = title.imdbRating ?? 'N/A';
      const rt = title.rtCriticScore ?? 'N/A';
      const rating = title.rated ?? 'N/A';
      console.log(title.canonicalName + ':');
      console.log('  IMDB: ' + imdb + '/10');
      console.log('  RT: ' + rt + '%');
      console.log('  Rating: ' + rating);
      console.log('');
    }
  }

  await prisma.$disconnect();
}
main();
