import prisma from '../src/lib/prisma';

async function checkSources() {
  const category = await prisma.awardCategory.findFirst({
    where: { slug: 'best-director' },
    include: {
      nominees: {
        include: { odds: true }
      }
    }
  });

  if (!category) {
    console.log('Category not found');
    return;
  }

  console.log(`\n${category.name} nominees with odds:\n`);

  for (const n of category.nominees) {
    const sources = n.odds.map(o => o.source);
    console.log(`${n.name}:`);
    console.log(`  Sources: ${sources.length > 0 ? sources.join(', ') : 'NONE'}`);
    for (const o of n.odds) {
      console.log(`    ${o.source}: ${(o.probability * 100).toFixed(0)}%`);
    }
    console.log('');
  }

  // Summary
  const allSources = new Set<string>();
  for (const n of category.nominees) {
    for (const o of n.odds) {
      allSources.add(o.source);
    }
  }
  console.log(`\nAll sources in this category: ${Array.from(allSources).join(', ')}`);
}

checkSources()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
