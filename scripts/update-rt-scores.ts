/**
 * Update RT scores for Polymarket titles
 * Uses direct RT fetch since OMDB coverage is incomplete
 */

import prisma from '../src/lib/prisma';
import { fetchRTScores, hasRTSlug } from '../src/lib/rottenTomatoes';

async function main() {
  console.log('=== Updating RT Scores for Polymarket Titles ===\n');

  // Get all Polymarket titles
  const titles = await prisma.title.findMany({
    where: { externalIds: { some: { provider: 'polymarket' } } },
    select: { id: true, canonicalName: true, rtCriticScore: true },
  });

  console.log('Found ' + titles.length + ' Polymarket titles\n');

  let updated = 0;

  for (const title of titles) {
    if (!hasRTSlug(title.canonicalName)) {
      console.log(title.canonicalName + ': No RT slug mapped');
      continue;
    }

    console.log('Fetching RT for: ' + title.canonicalName);
    const rtData = await fetchRTScores(title.canonicalName);

    if (rtData && rtData.tomatometer !== null) {
      await prisma.title.update({
        where: { id: title.id },
        data: { rtCriticScore: rtData.tomatometer },
      });
      console.log('  ✅ Updated: ' + rtData.tomatometer + '%');
      updated++;
    } else {
      console.log('  ❌ No score found');
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n=== Summary ===');
  console.log('Updated: ' + updated + '/' + titles.length);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
