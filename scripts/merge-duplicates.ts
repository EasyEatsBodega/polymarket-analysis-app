/**
 * Merge duplicate titles - keep the one with RT scores
 */

import prisma from '../src/lib/prisma';

async function main() {
  console.log('Merging duplicate titles...\n');

  // 1. Handle Wake Up Dead Man duplicates
  const wakeUpWithSubtitle = await prisma.title.findFirst({
    where: { canonicalName: 'Wake Up Dead Man: A Knives Out Mystery' },
  });

  const wakeUpWithoutSubtitle = await prisma.title.findFirst({
    where: { canonicalName: 'Wake Up Dead Man' },
  });

  if (wakeUpWithSubtitle && wakeUpWithoutSubtitle) {
    console.log('Found Wake Up Dead Man duplicates');

    // Delete the one without RT score (the empty one)
    await prisma.title.delete({
      where: { id: wakeUpWithoutSubtitle.id },
    });
    console.log('  Deleted empty "Wake Up Dead Man"');

    // Rename the one with RT score
    await prisma.title.update({
      where: { id: wakeUpWithSubtitle.id },
      data: { canonicalName: 'Wake Up Dead Man' },
    });
    console.log('  Renamed to "Wake Up Dead Man"');

    // Update external ID
    await prisma.titleExternalId.updateMany({
      where: { titleId: wakeUpWithSubtitle.id, provider: 'polymarket' },
      data: { externalId: 'Wake Up Dead Man' },
    });
  }

  // 2. Handle Run Away - just rename (no duplicate)
  const runAwayWithSuffix = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away: Limited Series' },
  });

  if (runAwayWithSuffix) {
    // Check if there's already a "Run Away"
    const runAwaySimple = await prisma.title.findFirst({
      where: { canonicalName: 'Run Away', type: 'SHOW' },
    });

    if (runAwaySimple) {
      // Merge - delete the empty one, keep the one with data
      if (!runAwaySimple.rtCriticScore && runAwayWithSuffix.rtCriticScore) {
        await prisma.title.delete({ where: { id: runAwaySimple.id } });
        await prisma.title.update({
          where: { id: runAwayWithSuffix.id },
          data: { canonicalName: 'Run Away' },
        });
        console.log('Merged Run Away titles');
      }
    } else {
      // Just rename
      await prisma.title.update({
        where: { id: runAwayWithSuffix.id },
        data: { canonicalName: 'Run Away' },
      });
      await prisma.titleExternalId.updateMany({
        where: { titleId: runAwayWithSuffix.id, provider: 'polymarket' },
        data: { externalId: 'Run Away' },
      });
      console.log('Renamed "Run Away: Limited Series" to "Run Away"');
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
