import prisma from '../src/lib/prisma';

async function checkPolymarketTitles() {
  // Get all titles with Polymarket external IDs
  const titlesWithPolymarket = await prisma.title.findMany({
    where: {
      externalIds: { some: { provider: 'polymarket' } }
    },
    include: {
      marketLinks: {
        include: {
          market: true
        }
      },
      weeklyGlobal: {
        orderBy: { weekStart: 'desc' },
        take: 1
      }
    }
  });

  console.log(`\nTitles with Polymarket external IDs: ${titlesWithPolymarket.length}`);

  for (const title of titlesWithPolymarket) {
    const latestRank = title.weeklyGlobal[0];
    console.log(`\n${title.canonicalName} (${title.type})`);
    console.log(`  - Market links: ${title.marketLinks.length}`);
    console.log(`  - Latest global rank: ${latestRank ? latestRank.rank : 'None'} (${latestRank ? latestRank.category : 'N/A'})`);
    if (title.marketLinks.length > 0) {
      console.log(`  - Market: ${title.marketLinks[0].market.question.substring(0, 60)}...`);
    }
  }

  // Also check market links table directly
  const allMarketLinks = await prisma.titleMarketLink.findMany({
    include: {
      title: true,
      market: true
    }
  });

  console.log(`\n\nTotal market links: ${allMarketLinks.length}`);
  for (const link of allMarketLinks) {
    console.log(`  ${link.title.canonicalName} -> ${link.market.question.substring(0, 50)}...`);
  }
}

checkPolymarketTitles()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
