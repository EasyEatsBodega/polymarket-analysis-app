/**
 * Merge duplicate titles - delete misspelled/incomplete versions
 * and keep the correctly named ones
 */
import prisma from '../src/lib/prisma';

async function mergeDuplicates() {
  console.log('Merging duplicate titles...\n');

  // IDs to delete (misspelled/incomplete)
  const toDelete = [
    'cmk1wk1o60024ebxaovoy2jks', // Evil Influencer: The Jodi Hidebrandt Story (misspelled)
    'cmk4om4q80021cr2ttfp2e2oh', // Wake Up Dead Man (incomplete)
  ];

  // IDs to keep (correct)
  const correctIds = {
    evilInfluencer: 'cmk1wk1d8001webxaiwc0e30y', // Evil Influencer: The Jodi Hildebrandt Story
    wakeUpDeadMan: 'cmk1lksr6004keay550jufc9i', // Wake Up Dead Man: A Knives Out Mystery
  };

  // First, migrate any external IDs from incorrect to correct titles
  for (const wrongId of toDelete) {
    const externalIds = await prisma.titleExternalId.findMany({
      where: { titleId: wrongId },
    });

    if (externalIds.length > 0) {
      console.log(`Found ${externalIds.length} external IDs on wrong title ${wrongId}`);

      // Determine correct ID based on which wrong ID this is
      const correctId = wrongId.includes('cmk1wk1o6')
        ? correctIds.evilInfluencer
        : correctIds.wakeUpDeadMan;

      // Update external IDs to point to correct title
      for (const extId of externalIds) {
        try {
          await prisma.titleExternalId.update({
            where: { id: extId.id },
            data: { titleId: correctId },
          });
          console.log(`  Migrated ${extId.provider} ID to correct title`);
        } catch (e) {
          // If there's a conflict, just delete the duplicate
          await prisma.titleExternalId.delete({ where: { id: extId.id } });
          console.log(`  Deleted duplicate ${extId.provider} ID`);
        }
      }
    }
  }

  // Delete related records first, then the titles
  for (const id of toDelete) {
    try {
      // Delete daily signals
      const signals = await prisma.dailySignal.deleteMany({ where: { titleId: id } });
      if (signals.count > 0) {
        console.log(`  Deleted ${signals.count} daily signals for ${id}`);
      }

      // Delete FlixPatrol daily records
      const flixpatrol = await prisma.flixPatrolDaily.deleteMany({ where: { titleId: id } });
      if (flixpatrol.count > 0) {
        console.log(`  Deleted ${flixpatrol.count} FlixPatrol records for ${id}`);
      }

      // Delete forecast weekly records
      const forecasts = await prisma.forecastWeekly.deleteMany({ where: { titleId: id } });
      if (forecasts.count > 0) {
        console.log(`  Deleted ${forecasts.count} forecast weekly records for ${id}`);
      }

      // Now delete the title
      await prisma.title.delete({ where: { id } });
      console.log(`Deleted incorrect title: ${id}`);
    } catch (e: any) {
      console.log(`Could not delete ${id}: ${e.message}`);
    }
  }

  // Verify final state
  console.log('\nFinal state:');
  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { canonicalName: { contains: 'Evil Influencer', mode: 'insensitive' } },
        { canonicalName: { contains: 'Wake Up Dead Man', mode: 'insensitive' } },
      ],
    },
    include: { externalIds: true },
  });

  for (const t of titles) {
    console.log(`  - ${t.canonicalName}`);
    console.log(`    External IDs: ${t.externalIds.map((e) => e.provider).join(', ') || 'none'}`);
  }

  await prisma.$disconnect();
}

mergeDuplicates().catch((e) => {
  console.error(e);
  process.exit(1);
});
