/**
 * Clean up stuck RUNNING jobs that never completed
 */
import prisma from '../src/lib/prisma';

async function cleanup() {
  // Find stuck RUNNING jobs older than 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const stuckJobs = await prisma.jobRun.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: tenMinutesAgo },
    },
  });

  console.log(`Found ${stuckJobs.length} stuck jobs\n`);

  for (const job of stuckJobs) {
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: 'FAIL',
        finishedAt: new Date(),
        error: 'Job timed out (cleaned up)',
      },
    });
    console.log(`  ✗ Marked as FAIL: ${job.jobName} started ${job.startedAt.toISOString()}`);
  }

  console.log('\nCleanup complete');
  await prisma.$disconnect();
}

cleanup();
