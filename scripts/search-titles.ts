import prisma from '../src/lib/prisma';

async function main() {
  // Search for specific titles
  const searchTerms = ['unlocked', 'jail', 'his & hers', '11.22.63', 'his and hers'];

  for (const term of searchTerms) {
    console.log(`\nSearching for "${term}":`);
    const titles = await prisma.title.findMany({
      where: {
        canonicalName: { contains: term, mode: 'insensitive' }
      },
      select: {
        id: true,
        canonicalName: true,
        type: true,
        externalIds: true,
      },
      take: 5
    });

    if (titles.length === 0) {
      console.log('  No results found');
    } else {
      titles.forEach(t => {
        console.log(`  - ${t.canonicalName} (${t.type})`);
        if (t.externalIds?.length) {
          console.log(`    External IDs: ${JSON.stringify(t.externalIds)}`);
        }
      });
    }
  }

  // Check Polymarket-sourced titles
  console.log('\n=== Polymarket-sourced titles ===');
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: {
        some: {
          provider: 'polymarket'
        }
      }
    },
    select: {
      canonicalName: true,
      type: true,
    }
  });

  console.log(`Found ${polymarketTitles.length} titles from Polymarket:`);
  polymarketTitles.forEach(t => console.log(`  - ${t.canonicalName} (${t.type})`));

  await prisma.$disconnect();
}

main().catch(console.error);
