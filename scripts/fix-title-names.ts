/**
 * Fix misspelled title names in the database
 */
import prisma from '../src/lib/prisma';

async function fixTitleNames() {
  console.log('Fixing misspelled title names...\n');

  // Fix Evil Influencer spelling (Hidebrandt -> Hildebrandt)
  const evil = await prisma.title.updateMany({
    where: { canonicalName: { contains: 'Hidebrandt' } },
    data: { canonicalName: 'Evil Influencer: The Jodi Hildebrandt Story' },
  });
  console.log(`Evil Influencer: ${evil.count} title(s) updated`);

  // Fix Wake Up Dead Man to include full title
  const wake = await prisma.title.updateMany({
    where: { canonicalName: 'Wake Up Dead Man' },
    data: { canonicalName: 'Wake Up Dead Man: A Knives Out Mystery' },
  });
  console.log(`Wake Up Dead Man: ${wake.count} title(s) updated`);

  // Verify the changes
  console.log('\nVerifying changes...');
  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { canonicalName: { contains: 'Evil Influencer' } },
        { canonicalName: { contains: 'Wake Up Dead Man' } },
      ],
    },
    select: { id: true, canonicalName: true },
  });

  console.log('Current titles:');
  titles.forEach((t) => console.log(`  - ${t.canonicalName}`));

  await prisma.$disconnect();
}

fixTitleNames().catch((e) => {
  console.error(e);
  process.exit(1);
});
