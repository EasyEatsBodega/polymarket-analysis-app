import prisma from '../src/lib/prisma';

async function main() {
  // Missing titles from Polymarket that we need to add
  const missingTitles = [
    {
      canonicalName: 'His & Hers',
      type: 'SHOW' as const,
      source: 'polymarket',
    },
    {
      canonicalName: '11.22.63',
      type: 'SHOW' as const,
      source: 'polymarket',
    },
  ];

  console.log('Adding missing titles...\n');

  for (const title of missingTitles) {
    // Check if already exists
    const existing = await prisma.title.findFirst({
      where: { canonicalName: title.canonicalName },
    });

    if (existing) {
      console.log(`"${title.canonicalName}" already exists (id: ${existing.id})`);
      continue;
    }

    // Create new title
    const created = await prisma.title.create({
      data: {
        canonicalName: title.canonicalName,
        type: title.type,
        externalIds: {
          create: {
            provider: 'polymarket',
            externalId: title.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          },
        },
      },
    });

    console.log(`✅ Created "${title.canonicalName}" (id: ${created.id})`);
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch(console.error);
