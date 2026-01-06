/**
 * Check recent scan_insiders job runs
 */
import prisma from '../src/lib/prisma';

async function main() {
  const runs = await prisma.jobRun.findMany({
    where: { jobName: 'scan_insiders' },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });

  console.log('Recent scan_insiders job runs:\n');

  for (const run of runs) {
    const details = run.detailsJson as Record<string, unknown> | null;
    const duration = details?.durationMs ? ((details.durationMs as number) / 1000).toFixed(1) + 's' : 'N/A';
    const created = details?.walletsCreated ?? 'N/A';
    const updated = details?.walletsUpdated ?? 'N/A';
    const scanned = details?.walletsScanned ?? 'N/A';
    const trigger = details?.triggeredBy ?? 'N/A';

    const status = run.status === 'SUCCESS' ? '✓' : run.status === 'FAIL' ? '✗' : '⏳';
    const time = run.startedAt.toISOString().replace('T', ' ').slice(0, 19);

    console.log(`${status} [${run.status}] ${time}`);
    console.log(`  Trigger: ${trigger} | Duration: ${duration}`);
    console.log(`  Scanned: ${scanned} | Created: ${created} | Updated: ${updated}`);
    if (run.error) console.log(`  Error: ${run.error}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main();
