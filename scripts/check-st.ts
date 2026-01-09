import prisma from '../src/lib/prisma';
async function main() {
  const titles = await prisma.title.findMany({
    where: { canonicalName: { contains: 'Stranger Things', mode: 'insensitive' } },
    select: { id: true, canonicalName: true, imdbRating: true, rtCriticScore: true, metascore: true, ratingsUpdatedAt: true }
  });
  console.log(JSON.stringify(titles, null, 2));
  await prisma.$disconnect();
}
main();
