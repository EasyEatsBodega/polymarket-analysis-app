/**
 * Fetch ratings for titles that appear in Polymarket Netflix markets
 *
 * This matches Polymarket outcome names to database titles and fetches ratings.
 */

import prisma from '../src/lib/prisma';
import { searchOMDB, cleanTitleForSearch } from '../src/lib/omdb';

async function main() {
  // Fetch current Polymarket markets directly from Polymarket API
  console.log('Fetching Polymarket Netflix markets...\n');

  // Known current market slugs for Netflix shows
  const marketSlugs = [
    'what-will-be-the-top-global-netflix-show-this-week-778',
    'what-will-be-the-2-global-netflix-show-this-week-752',
  ];

  const titleNames = new Set<string>();

  for (const slug of marketSlugs) {
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
      const events = await res.json();
      if (events[0]?.markets) {
        for (const market of events[0].markets) {
          if (market.groupItemTitle && !market.groupItemTitle.includes('Show ')) {
            titleNames.add(market.groupItemTitle);
          }
        }
      }
    } catch (e) {
      console.log(`Failed to fetch ${slug}`);
    }
  }

  // Also add known titles from the screenshot
  const knownTitles = [
    'Stranger Things: Season 5',
    'Run Away: Limited Series',
    'Emily in Paris: Season 5',
    'His & Hers',
    '11.22.63',
    'Unlocked: A Jail Experiment: Season 2'
  ];
  knownTitles.forEach(t => titleNames.add(t));

  console.log(`Found ${titleNames.size} unique titles in Polymarket:\n`);

  for (const name of titleNames) {
    console.log(`  - ${name}`);
  }

  console.log('\n--- Matching to database and fetching ratings ---\n');

  let updated = 0;
  let notFound = 0;
  let alreadyHasRatings = 0;

  for (const titleName of titleNames) {
    // Try to find in database
    let title = await prisma.title.findFirst({
      where: { canonicalName: { equals: titleName, mode: 'insensitive' } },
      select: { id: true, canonicalName: true, type: true, imdbRating: true }
    });

    // Try partial match if exact match fails
    if (!title) {
      // Try without ": Season X" or ": Limited Series"
      const baseName = titleName
        .replace(/:\s*(Season|Limited Series)\s*\d*/i, '')
        .trim();

      title = await prisma.title.findFirst({
        where: { canonicalName: { contains: baseName, mode: 'insensitive' } },
        select: { id: true, canonicalName: true, type: true, imdbRating: true }
      });
    }

    if (!title) {
      console.log(`❌ ${titleName}: Not found in database`);
      notFound++;
      continue;
    }

    if (title.imdbRating) {
      console.log(`✓ ${title.canonicalName}: Already has IMDB ${title.imdbRating}`);
      alreadyHasRatings++;
      continue;
    }

    // Fetch from OMDB
    const searchTitle = cleanTitleForSearch(title.canonicalName);
    const type = title.type === 'SHOW' ? 'series' : 'movie';

    console.log(`🔍 ${title.canonicalName}: Searching OMDB...`);

    const ratings = await searchOMDB(searchTitle, type);

    if (ratings && ratings.imdbRating) {
      await prisma.title.update({
        where: { id: title.id },
        data: {
          imdbId: ratings.imdbId,
          imdbRating: ratings.imdbRating,
          imdbVotes: ratings.imdbVotes,
          rtCriticScore: ratings.rtCriticScore,
          metascore: ratings.metascore,
          rated: ratings.rated,
          ratingsUpdatedAt: new Date(),
        }
      });
      console.log(`  ✅ IMDB: ${ratings.imdbRating}/10 | RT: ${ratings.rtCriticScore ?? 'N/A'}%`);
      updated++;
    } else {
      // Mark as checked
      await prisma.title.update({
        where: { id: title.id },
        data: { ratingsUpdatedAt: new Date() }
      });
      console.log(`  ⚠️ Not found in OMDB`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total Polymarket titles: ${titleNames.size}`);
  console.log(`Already had ratings: ${alreadyHasRatings}`);
  console.log(`Newly updated: ${updated}`);
  console.log(`Not in database: ${notFound}`);

  await prisma.$disconnect();
}

main().catch(console.error);
