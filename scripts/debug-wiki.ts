import prisma from '../src/lib/prisma';

async function main() {
  // Check Stranger Things
  const st = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Stranger Things' } },
    select: { id: true, canonicalName: true }
  });
  console.log('Found title:', st);

  if (st) {
    const signals = await prisma.dailySignal.findMany({
      where: { titleId: st.id, source: 'WIKIPEDIA' },
      orderBy: { date: 'desc' },
      take: 3
    });
    console.log('Wikipedia signals:', signals.map(s => ({value: s.value, date: s.date})));
  }

  // Check Emily in Paris
  const eip = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Emily' } },
    select: { id: true, canonicalName: true }
  });
  console.log('\nFound Emily:', eip);

  if (eip) {
    const signals = await prisma.dailySignal.findMany({
      where: { titleId: eip.id, source: 'WIKIPEDIA' },
      orderBy: { date: 'desc' },
      take: 3
    });
    console.log('Wikipedia signals:', signals.map(s => ({value: s.value, date: s.date})));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
