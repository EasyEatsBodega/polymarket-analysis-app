import prisma from '../src/lib/prisma';

async function check() {
  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { canonicalName: { contains: 'Evil Influencer', mode: 'insensitive' } },
        { canonicalName: { contains: 'Wake Up Dead Man', mode: 'insensitive' } },
        { canonicalName: { contains: 'Hidebrandt', mode: 'insensitive' } },
        { canonicalName: { contains: 'Hildebrandt', mode: 'insensitive' } },
      ],
    },
    select: { id: true, canonicalName: true, type: true },
  });

  console.log(`Found ${titles.length} titles:`);
  for (const t of titles) {
    console.log(`  - [${t.type}] ${t.canonicalName} (${t.id})`);
  }

  await prisma.$disconnect();
}

check();
