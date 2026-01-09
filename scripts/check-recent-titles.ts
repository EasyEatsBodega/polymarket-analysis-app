import prisma from '../src/lib/prisma';

async function checkRecent() {
  // Get the most recent week's data
  const latestWeek = await prisma.netflixWeeklyGlobal.findFirst({
    orderBy: { weekStart: 'desc' },
  });

  console.log('\n=== Most Recent Week ===');
  console.log('Week of:', latestWeek?.weekStart.toISOString().split('T')[0]);

  // Get all titles from the most recent week
  const recentTitles = await prisma.netflixWeeklyGlobal.findMany({
    where: { weekStart: latestWeek?.weekStart },
    include: { title: true },
    orderBy: [{ category: 'asc' }, { rank: 'asc' }],
  });

  console.log('\n=== TV (English) - Latest Week ===');
  recentTitles
    .filter(r => r.category === 'TV (English)')
    .slice(0, 10)
    .forEach(r => console.log(`  #${r.rank} ${r.title.canonicalName}`));

  console.log('\n=== TV (Non-English) - Latest Week ===');
  recentTitles
    .filter(r => r.category === 'TV (Non-English)')
    .slice(0, 10)
    .forEach(r => console.log(`  #${r.rank} ${r.title.canonicalName}`));

  // Check if His & Hers has any weekly data
  const hisHersTitle = await prisma.title.findFirst({
    where: { canonicalName: 'His & Hers' },
  });

  if (hisHersTitle) {
    const hisHersWeeks = await prisma.netflixWeeklyGlobal.findMany({
      where: { titleId: hisHersTitle.id },
      orderBy: { weekStart: 'desc' },
      take: 5,
    });
    console.log('\n=== His & Hers Weekly Data ===');
    hisHersWeeks.forEach(w =>
      console.log(`  Week ${w.weekStart.toISOString().split('T')[0]}: #${w.rank} in ${w.category}`)
    );
  }

  // Search for any "Runaway" in recent data
  const runawayTitles = await prisma.title.findMany({
    where: { canonicalName: { contains: 'Runaway', mode: 'insensitive' } },
    include: {
      netflixWeeklyGlobal: {
        orderBy: { weekStart: 'desc' },
        take: 1,
      },
    },
  });
  console.log('\n=== Runaway Titles with Data ===');
  runawayTitles.forEach(t => {
    const latestData = t.netflixWeeklyGlobal[0];
    console.log(`  ${t.canonicalName}: ${latestData ? `#${latestData.rank} (${latestData.weekStart.toISOString().split('T')[0]})` : 'No data'}`);
  });

  await prisma.$disconnect();
}

checkRecent().catch(console.error);
