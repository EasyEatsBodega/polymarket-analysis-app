/**
 * Check latest job run details
 */
const { PrismaClient } = require('@prisma/client');
const { withAccelerate } = require('@prisma/extension-accelerate');

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL,
}).$extends(withAccelerate());

async function main() {
  console.log('=== Recent Job Runs ===\n');

  const jobs = await prisma.jobRun.findMany({
    where: { jobName: 'generate_forecasts' },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });

  for (const job of jobs) {
    console.log('Job ID:', job.id);
    console.log('  Status:', job.status);
    console.log('  Started:', job.startedAt);
    console.log('  Finished:', job.finishedAt);
    console.log('  Error:', job.error || 'none');
    console.log('  Details:', JSON.stringify(job.detailsJson, null, 2));
    console.log('');
  }

  // Check forecasts with v1.3.0
  console.log('=== Forecasts with v1.3.0 ===\n');
  const v13Forecasts = await prisma.forecastWeekly.findMany({
    where: { modelVersion: '1.3.0' },
    take: 10,
    include: { title: { select: { canonicalName: true } } }
  });

  console.log('Count:', v13Forecasts.length);
  for (const f of v13Forecasts.slice(0, 5)) {
    console.log('  -', f.title.canonicalName, 'p50:', f.p50);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
