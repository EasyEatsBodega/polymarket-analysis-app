import prisma from '../src/lib/prisma';

async function checkData() {
  // Check last job run
  const lastJob = await prisma.jobRun.findFirst({
    where: { jobName: { contains: 'netflix' } },
    orderBy: { startedAt: 'desc' },
  });
  console.log('\n=== Last Netflix Ingestion ===');
  console.log('Job:', lastJob?.jobName);
  console.log('Status:', lastJob?.status);
  console.log('Date:', lastJob?.startedAt?.toISOString());

  // Check for Runaway
  const runaway = await prisma.title.findMany({
    where: { canonicalName: { contains: 'Runaway', mode: 'insensitive' } },
  });
  console.log('\n=== Runaway Titles ===');
  console.log('Found:', runaway.length);
  runaway.forEach(t => console.log(`  - ${t.canonicalName} (${t.type})`));

  // Check for His & Hers variations
  const hisHers = await prisma.title.findMany({
    where: {
      OR: [
        { canonicalName: { contains: 'His', mode: 'insensitive' } },
        { canonicalName: { contains: 'Hers', mode: 'insensitive' } },
      ]
    },
  });
  console.log('\n=== His/Hers Titles ===');
  console.log('Found:', hisHers.length);
  hisHers.forEach(t => console.log(`  - ${t.canonicalName} (${t.type})`));

  // Check recent weeks in database
  const weeks = await prisma.netflixWeeklyGlobal.findMany({
    distinct: ['weekStart'],
    orderBy: { weekStart: 'desc' },
    take: 5,
    select: { weekStart: true },
  });
  console.log('\n=== Recent Weeks in DB ===');
  weeks.forEach(w => console.log(`  - ${w.weekStart.toISOString().split('T')[0]}`));

  // Total titles
  const totalTitles = await prisma.title.count();
  console.log('\n=== Total Titles ===');
  console.log('Count:', totalTitles);

  await prisma.$disconnect();
}

checkData().catch(console.error);
