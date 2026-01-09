import prisma from '../src/lib/prisma';

async function checkDuplicateTitles() {
  // Check for titles with same canonical name
  const titles = await prisma.title.findMany({
    include: {
      externalIds: true,
      weeklyGlobal: {
        orderBy: { weekStart: 'desc' },
        take: 1
      }
    }
  });

  // Group by normalized name
  const byName = new Map<string, typeof titles>();
  for (const title of titles) {
    const key = title.canonicalName.toLowerCase().replace(/:\s*season\s*\d+$/i, '').trim();
    if (!byName.has(key)) {
      byName.set(key, []);
    }
    byName.get(key)!.push(title);
  }

  // Find duplicates
  console.log('\n=== Potential Duplicates ===');
  let hasDuplicates = false;
  for (const [name, group] of byName.entries()) {
    if (group.length > 1) {
      hasDuplicates = true;
      console.log(`\n"${name}" has ${group.length} entries:`);
      for (const t of group) {
        const hasPolymarket = t.externalIds.some(e => e.provider === 'polymarket');
        const hasRanking = t.weeklyGlobal.length > 0;
        console.log(`  ID: ${t.id}`);
        console.log(`    Name: ${t.canonicalName}`);
        console.log(`    Polymarket: ${hasPolymarket ? 'YES' : 'no'}`);
        console.log(`    Ranking: ${hasRanking ? '#' + t.weeklyGlobal[0].rank : 'none'}`);
      }
    }
  }

  if (!hasDuplicates) {
    console.log('No duplicates found');
  }

  // Now specifically check the Polymarket outcome names
  console.log('\n=== Polymarket Outcomes Check ===');
  const outcomeNames = ['Run Away', 'His & Hers', '11.22.63', 'Stranger Things'];

  for (const name of outcomeNames) {
    const matches = await prisma.title.findMany({
      where: {
        canonicalName: { contains: name, mode: 'insensitive' }
      },
      include: {
        externalIds: true,
        weeklyGlobal: { orderBy: { weekStart: 'desc' }, take: 1 }
      }
    });

    console.log(`\n"${name}" matches ${matches.length} title(s):`);
    for (const m of matches) {
      const hasPolymarket = m.externalIds.some(e => e.provider === 'polymarket');
      const hasRanking = m.weeklyGlobal.length > 0;
      console.log(`  ${m.canonicalName} (${m.type})`);
      console.log(`    ID: ${m.id}`);
      console.log(`    Polymarket ExternalID: ${hasPolymarket}`);
      console.log(`    Has Ranking: ${hasRanking ? '#' + m.weeklyGlobal[0].rank : 'none'}`);
    }
  }
}

checkDuplicateTitles()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
