import prisma from '../src/lib/prisma';

async function checkJobsStatus() {
  // Get recent job runs
  const recentJobs = await prisma.jobRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  console.log('\n=== Recent Job Runs ===');
  for (const job of recentJobs) {
    const date = job.startedAt.toISOString().split('T')[0];
    const time = job.startedAt.toISOString().split('T')[1].slice(0, 5);
    console.log(`${date} ${time} | ${job.status.padEnd(7)} | ${job.jobName}`);
  }

  // Check for signals data
  const signalCount = await prisma.dailySignal.count();
  const recentSignals = await prisma.dailySignal.findMany({
    orderBy: { date: 'desc' },
    take: 5,
    include: { title: true },
  });

  console.log('\n=== Daily Signals Data ===');
  console.log(`Total signals: ${signalCount}`);
  console.log('Recent signals:');
  for (const signal of recentSignals) {
    console.log(`  ${signal.date.toISOString().split('T')[0]} | ${signal.source} | ${signal.geo} | ${signal.value} | ${signal.title.canonicalName}`);
  }

  // Check unique dates for signals
  const signalDates = await prisma.dailySignal.findMany({
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 10,
    select: { date: true },
  });
  console.log('\n=== Signal Dates ===');
  signalDates.forEach(s => console.log(`  ${s.date.toISOString().split('T')[0]}`));

  await prisma.$disconnect();
}

checkJobsStatus().catch(console.error);
