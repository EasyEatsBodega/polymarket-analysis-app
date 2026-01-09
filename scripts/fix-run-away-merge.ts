import prisma from '../src/lib/prisma';

async function fixRunAwayMerge() {
  console.log('=== Merging Run Away titles ===');

  // Find both titles
  const polymarketTitle = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away' },
    include: { externalIds: true }
  });

  const netflixTitle = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away: Limited Series' },
    include: {
      externalIds: true,
      weeklyGlobal: { take: 1, orderBy: { weekStart: 'desc' } }
    }
  });

  if (!polymarketTitle) {
    console.log('Polymarket title "Run Away" not found');
    return;
  }

  if (!netflixTitle) {
    console.log('Netflix title "Run Away: Limited Series" not found');
    return;
  }

  console.log(`\nPolymarket title: ${polymarketTitle.canonicalName} (${polymarketTitle.id})`);
  console.log(`  External IDs: ${polymarketTitle.externalIds.map(e => `${e.provider}:${e.externalId}`).join(', ')}`);

  console.log(`\nNetflix title: ${netflixTitle.canonicalName} (${netflixTitle.id})`);
  console.log(`  Ranking: #${netflixTitle.weeklyGlobal[0]?.rank || 'none'}`);
  console.log(`  External IDs: ${netflixTitle.externalIds.map(e => `${e.provider}:${e.externalId}`).join(', ') || 'none'}`);

  // Step 1: Add "Run Away" as alias to Netflix title
  const currentAliases = (netflixTitle.aliases as string[]) || [];
  if (!currentAliases.includes('Run Away')) {
    await prisma.title.update({
      where: { id: netflixTitle.id },
      data: {
        aliases: [...currentAliases, 'Run Away']
      }
    });
    console.log('\n✓ Added "Run Away" as alias to Netflix title');
  }

  // Step 2: Move Polymarket external ID to Netflix title
  const polymarketExtId = polymarketTitle.externalIds.find(e => e.provider === 'polymarket');
  if (polymarketExtId) {
    // Check if Netflix title already has this external ID
    const existingExtId = netflixTitle.externalIds.find(
      e => e.provider === 'polymarket' && e.externalId === polymarketExtId.externalId
    );

    if (!existingExtId) {
      await prisma.titleExternalId.update({
        where: { id: polymarketExtId.id },
        data: { titleId: netflixTitle.id }
      });
      console.log('✓ Moved Polymarket external ID to Netflix title');
    }
  }

  // Step 3: Delete related records from Polymarket title before deleting it
  console.log('\nCleaning up orphaned Polymarket title...');

  // Delete daily signals
  const deletedSignals = await prisma.dailySignal.deleteMany({
    where: { titleId: polymarketTitle.id }
  });
  console.log(`  Deleted ${deletedSignals.count} daily signals`);

  // Delete FlixPatrol data
  const deletedTrailers = await prisma.flixPatrolTrailer.deleteMany({
    where: { titleId: polymarketTitle.id }
  });
  console.log(`  Deleted ${deletedTrailers.count} FlixPatrol trailers`);

  const deletedSocial = await prisma.flixPatrolSocial.deleteMany({
    where: { titleId: polymarketTitle.id }
  });
  console.log(`  Deleted ${deletedSocial.count} FlixPatrol social records`);

  // Delete forecasts
  const deletedForecasts = await prisma.forecastWeekly.deleteMany({
    where: { titleId: polymarketTitle.id }
  });
  console.log(`  Deleted ${deletedForecasts.count} forecasts`);

  // Delete remaining external IDs
  const deletedExtIds = await prisma.titleExternalId.deleteMany({
    where: { titleId: polymarketTitle.id }
  });
  console.log(`  Deleted ${deletedExtIds.count} remaining external IDs`);

  // Step 4: Delete the duplicate Polymarket title
  await prisma.title.delete({
    where: { id: polymarketTitle.id }
  });
  console.log('✓ Deleted duplicate Polymarket title');

  // Verify
  const verifyTitle = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away: Limited Series' },
    include: {
      externalIds: true,
      weeklyGlobal: { take: 1, orderBy: { weekStart: 'desc' } }
    }
  });

  console.log('\n=== Verification ===');
  console.log(`Title: ${verifyTitle?.canonicalName}`);
  console.log(`Aliases: ${(verifyTitle?.aliases as string[])?.join(', ') || 'none'}`);
  console.log(`External IDs: ${verifyTitle?.externalIds.map(e => `${e.provider}:${e.externalId}`).join(', ') || 'none'}`);
  console.log(`Ranking: #${verifyTitle?.weeklyGlobal[0]?.rank || 'none'}`);
}

fixRunAwayMerge()
  .then(() => console.log('\nDone!'))
  .catch(e => console.error('Error:', e))
  .finally(() => prisma.$disconnect());
