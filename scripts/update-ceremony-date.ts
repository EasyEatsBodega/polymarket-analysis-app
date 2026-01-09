import prisma from '../src/lib/prisma';

async function updateCeremonyDate() {
  try {
    const show = await prisma.awardShow.update({
      where: { slug: 'golden-globes-2026' },
      data: {
        ceremonyDate: new Date('2026-01-11T20:00:00-08:00'), // Sunday, January 11, 2026 at 8pm PST
        status: 'ACTIVE'
      }
    });
    console.log('✅ Updated successfully!');
    console.log('   Show:', show.name);
    console.log('   Date:', show.ceremonyDate.toISOString());
    console.log('   Status:', show.status);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateCeremonyDate();
