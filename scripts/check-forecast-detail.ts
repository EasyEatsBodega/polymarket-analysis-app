/**
 * Check forecast details for His & Hers
 */
const { PrismaClient } = require('@prisma/client');
const { withAccelerate } = require('@prisma/extension-accelerate');

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL,
}).$extends(withAccelerate());

async function main() {
  console.log('=== His & Hers Forecast Details ===\n');

  const title = await prisma.title.findFirst({
    where: { canonicalName: 'His & Hers' },
    include: {
      forecasts: {
        orderBy: { createdAt: 'desc' },
        take: 2,
      },
    }
  });

  if (title) {
    console.log('Title:', title.canonicalName);
    console.log('ID:', title.id);

    for (const f of title.forecasts) {
      console.log('\nForecast from:', f.createdAt);
      console.log('  p50:', f.p50);
      console.log('  Model version:', f.modelVersion);
      console.log('  Explain JSON:', JSON.stringify(f.explainJson, null, 2));
    }
  }

  // Also check Run Away
  console.log('\n=== Run Away Forecast Details ===\n');

  const runAway = await prisma.title.findFirst({
    where: { canonicalName: 'Run Away' },
    include: {
      forecasts: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    }
  });

  if (runAway && runAway.forecasts[0]) {
    const f = runAway.forecasts[0];
    console.log('Title:', runAway.canonicalName);
    console.log('  p50:', f.p50);
    console.log('  Model version:', f.modelVersion);
    console.log('  Explain JSON:', JSON.stringify(f.explainJson, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
