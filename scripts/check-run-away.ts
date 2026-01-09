/**
 * Check Run Away titles in FlixPatrol
 */
import axios from 'axios';

const API_KEY = 'aku_nJHoV46scBZ5bMKzLHDR3P2m';
const BASE = 'https://api.flixpatrol.com/v2';

const api = axios.create({
  baseURL: BASE,
  auth: { username: API_KEY, password: '' },
  headers: { 'Accept': 'application/json' },
  timeout: 30000,
});

async function main() {
  console.log('Checking "Run Away" titles in FlixPatrol\n');

  // Search for all Run Away titles
  const response = await api.get('/titles', {
    params: { 'title[like]': '%Run Away%' },
  });

  if (response.data.data) {
    console.log(`Found ${response.data.data.length} titles:\n`);

    for (const item of response.data.data) {
      const t = item.data;
      console.log(`Title: ${t.title}`);
      console.log(`  ID: ${t.id}`);
      console.log(`  IMDB: ${t.imdbId} → https://www.imdb.com/title/tt${t.imdbId}/`);
      console.log(`  TMDB: ${t.tmdbId}`);
      console.log(`  Link: ${t.link}`);
      console.log('');
    }
  }

  // Also check what we have in our database
  console.log('\n--- Checking our database ---');
  const prisma = (await import('../src/lib/prisma')).default;

  const ourRunAway = await prisma.title.findFirst({
    where: { canonicalName: { contains: 'Run Away', mode: 'insensitive' } },
    include: { externalIds: true },
  });

  if (ourRunAway) {
    console.log(`Our DB: ${ourRunAway.canonicalName}`);
    console.log(`  Type: ${ourRunAway.type}`);
    console.log(`  External IDs:`, ourRunAway.externalIds);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
