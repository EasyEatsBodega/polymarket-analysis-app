import prisma from '../src/lib/prisma';

async function main() {
  const titlesToCheck = ['Run Away', 'Unlocked', '11.22.63', 'His & Hers'];

  console.log('=== Checking Polymarket titles ===\n');

  for (const term of titlesToCheck) {
    const title = await prisma.title.findFirst({
      where: { canonicalName: { contains: term, mode: 'insensitive' } },
      include: { externalIds: true }
    });

    if (title) {
      console.log(`${title.canonicalName}:`);
      console.log(`  ID: ${title.id}`);
      console.log(`  External IDs: ${title.externalIds.length > 0 ? title.externalIds.map(e => `${e.provider}:${e.externalId}`).join(', ') : 'NONE'}`);

      // Check for Netflix data
      const netflixGlobal = await prisma.netflixWeeklyGlobal.count({
        where: { titleId: title.id }
      });
      const netflixUS = await prisma.netflixWeeklyUS.count({
        where: { titleId: title.id }
      });

      console.log(`  Netflix Global weeks: ${netflixGlobal}`);
      console.log(`  Netflix US weeks: ${netflixUS}`);

      // Check recent Netflix (30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentGlobal = await prisma.netflixWeeklyGlobal.count({
        where: { titleId: title.id, weekStart: { gte: thirtyDaysAgo } }
      });

      console.log(`  Recent Netflix data (30 days): ${recentGlobal}`);

      // Check signals
      const signals = await prisma.dailySignal.findMany({
        where: { titleId: title.id },
        orderBy: { date: 'desc' },
        take: 3
      });

      console.log(`  Recent signals: ${signals.length > 0 ? signals.map(s => `${s.source}:${s.value}`).join(', ') : 'NONE'}`);

      // Check forecasts
      const forecasts = await prisma.forecastWeekly.count({
        where: { titleId: title.id }
      });
      console.log(`  Forecasts: ${forecasts}`);
    } else {
      console.log(`"${term}": NOT IN DATABASE`);
    }
    console.log('');
  }

  // Check what the forecast generator would pick up
  console.log('\n=== What forecast generator queries ===\n');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Netflix titles with recent data
  const netflixTitles = await prisma.title.count({
    where: {
      OR: [
        { weeklyGlobal: { some: { weekStart: { gte: thirtyDaysAgo } } } },
        { weeklyUS: { some: { weekStart: { gte: thirtyDaysAgo } } } },
      ],
    },
  });
  console.log(`Netflix titles with data in last 30 days: ${netflixTitles}`);

  // Polymarket pre-release titles (no Netflix data at all)
  const polymarketPreRelease = await prisma.title.findMany({
    where: {
      externalIds: {
        some: { provider: 'polymarket' },
      },
      AND: [
        { weeklyGlobal: { none: {} } },
        { weeklyUS: { none: {} } },
      ],
    },
    select: { canonicalName: true },
  });
  console.log(`Polymarket titles with NO Netflix data: ${polymarketPreRelease.length}`);
  polymarketPreRelease.forEach(t => console.log(`  - ${t.canonicalName}`));

  // Titles with polymarket external ID
  const polymarketTitles = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } }
    },
    select: { canonicalName: true }
  });
  console.log(`\nAll titles with polymarket external ID: ${polymarketTitles.length}`);
  polymarketTitles.forEach(t => console.log(`  - ${t.canonicalName}`));

  await prisma.$disconnect();
}

main().catch(console.error);
