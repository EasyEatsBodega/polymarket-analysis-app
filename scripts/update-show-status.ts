import prisma from '../src/lib/prisma';

async function main() {
  console.log('Fetching Golden Globes show...');

  const show = await prisma.awardShow.findUnique({
    where: { slug: 'golden-globes-2026' },
    select: { id: true, name: true, status: true, ceremonyDate: true }
  });

  console.log('Current status:', show);

  if (!show) {
    console.log('Show not found!');
    return;
  }

  // Update to ACTIVE since the ceremony hasn't happened yet
  const updated = await prisma.awardShow.update({
    where: { slug: 'golden-globes-2026' },
    data: { status: 'ACTIVE' }
  });

  console.log('Updated status to:', updated.status);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
