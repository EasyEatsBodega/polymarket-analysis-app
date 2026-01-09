/**
 * Check for duplicate titles
 */

import prisma from '../src/lib/prisma';

async function check() {
  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { canonicalName: { contains: 'Wake Up' } },
        { canonicalName: { contains: 'Run Away' } },
      ],
    },
    include: { externalIds: true },
  });

  console.log('Found ' + titles.length + ' titles:\n');

  for (const t of titles) {
    console.log(t.canonicalName + ' (id: ' + t.id.substring(0, 8) + '...)');
    console.log('  Type: ' + t.type);
    console.log('  RT Score: ' + (t.rtCriticScore ?? 'N/A'));
    console.log('  ExternalIds: ' + t.externalIds.map((e) => e.provider).join(', '));
    console.log('');
  }

  await prisma.$disconnect();
}

check().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
