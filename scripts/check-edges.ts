import prisma from '../src/lib/prisma';

async function checkEdges() {
  const nominees = await prisma.awardNominee.findMany({
    where: {
      odds: {
        some: {
          source: 'MYBOOKIE'
        }
      }
    },
    include: {
      category: true,
      odds: true
    }
  });

  console.log('\n🔍 Edge Comparison (Polymarket vs MyBookie)\n');
  console.log(`Found ${nominees.length} nominees with MyBookie odds\n`);

  let edgesFound = 0;

  for (const n of nominees) {
    const pm = n.odds.find(o => o.source === 'POLYMARKET');
    const mb = n.odds.find(o => o.source === 'MYBOOKIE');

    if (pm && mb) {
      edgesFound++;
      const edge = (mb.probability - pm.probability) * 100;
      const sign = edge > 0 ? '+' : '';
      console.log(`${n.category.name}:`);
      console.log(`  ${n.name}`);
      console.log(`    Polymarket: ${(pm.probability * 100).toFixed(1)}%`);
      console.log(`    MyBookie:   ${(mb.probability * 100).toFixed(1)}% (${mb.rawOdds})`);
      console.log(`    Edge: ${sign}${edge.toFixed(1)}%\n`);
    } else if (mb) {
      console.log(`${n.category.name}: ${n.name}`);
      console.log(`  MyBookie only: ${(mb.probability * 100).toFixed(1)}% (${mb.rawOdds})\n`);
    }
  }

  console.log(`\nTotal nominees with both sources: ${edgesFound}`);
}

checkEdges()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
