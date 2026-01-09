/**
 * Rename DB titles to match Polymarket naming exactly
 */

import prisma from '../src/lib/prisma';

const renames = [
  { from: 'Wake Up Dead Man: A Knives Out Mystery', to: 'Wake Up Dead Man' },
  { from: 'Run Away: Limited Series', to: 'Run Away' },
];

async function main() {
  console.log('Renaming titles to match Polymarket...\n');

  for (const { from, to } of renames) {
    const result = await prisma.title.updateMany({
      where: { canonicalName: from },
      data: { canonicalName: to },
    });

    if (result.count > 0) {
      console.log('✅ Renamed: ' + from + ' -> ' + to);

      // Also update external IDs
      await prisma.titleExternalId.updateMany({
        where: { provider: 'polymarket', externalId: from },
        data: { externalId: to },
      });
    } else {
      console.log('⏭️  Not found: ' + from);
    }
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
