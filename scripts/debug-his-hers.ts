/**
 * Debug His & Hers title status
 */
const { PrismaClient } = require('@prisma/client');
const { withAccelerate } = require('@prisma/extension-accelerate');

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL,
}).$extends(withAccelerate());

async function main() {
  console.log('=== Checking "His & Hers" in database ===\n');

  // 1. Check if title exists
  const title = await prisma.title.findFirst({
    where: {
      OR: [
        { canonicalName: { contains: 'His', mode: 'insensitive' } },
        { canonicalName: { contains: 'Hers', mode: 'insensitive' } },
      ]
    },
    include: {
      externalIds: true,
      forecasts: { take: 1, orderBy: { createdAt: 'desc' } },
    }
  });

  if (title) {
    console.log('✓ Title found:', title.canonicalName);
    console.log('  ID:', title.id);
    console.log('  Type:', title.type);
    console.log('  External IDs:', JSON.stringify(title.externalIds));
    console.log('  Recent forecast:', title.forecasts[0] || 'NONE');
  } else {
    console.log('✗ Title NOT found in database');
  }

  // 2. Check all Polymarket-linked TV Shows
  console.log('\n=== All Polymarket-linked TV Shows ===\n');
  const polyTitles = await prisma.title.findMany({
    where: {
      type: 'SHOW',
      externalIds: { some: { provider: 'polymarket' } }
    },
    include: {
      externalIds: { where: { provider: 'polymarket' } },
      forecasts: { take: 1, orderBy: { createdAt: 'desc' }, select: { p50: true, createdAt: true } },
    }
  });

  for (const t of polyTitles) {
    const forecast = t.forecasts[0];
    const extId = t.externalIds[0];
    console.log('  ' + t.canonicalName);
    console.log('    External ID: ' + (extId ? extId.externalId : 'none'));
    console.log('    Forecast p50: ' + (forecast ? forecast.p50 : 'NONE'));
  }

  // 3. Check Run Away too
  console.log('\n=== Checking "Run Away" (Harlan Coben) ===\n');
  const runAway = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Run Away', mode: 'insensitive' } },
    include: {
      externalIds: true,
      forecasts: { take: 1, orderBy: { createdAt: 'desc' } },
    }
  });

  if (runAway) {
    console.log('✓ Title found:', runAway.canonicalName);
    console.log('  Has Polymarket link:', runAway.externalIds.some((e: any) => e.provider === 'polymarket'));
    console.log('  Recent forecast p50:', runAway.forecasts[0] ? runAway.forecasts[0].p50 : 'NONE');
  } else {
    console.log('✗ Run Away NOT found');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
