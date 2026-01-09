/**
 * Test star power calculation for a title
 */

import { searchAndGetCredits } from '../src/lib/tmdbCast';

async function main() {
  const query = process.argv[2] || 'His & Hers';
  const type = (process.argv[3] || 'SHOW') as 'MOVIE' | 'SHOW';

  console.log(`\nSearching for: "${query}" (${type})\n`);

  const result = await searchAndGetCredits(query, type);

  if (!result) {
    console.log('No results found');
    return;
  }

  console.log('='.repeat(60));
  console.log(`${result.name} (TMDB ID: ${result.tmdbId})`);
  console.log('='.repeat(60));

  console.log(`\nStar Power Score: ${result.credits.starPowerScore}/100`);

  if (result.credits.starPowerScore >= 80) {
    console.log('→ A-list ensemble - Major stars');
  } else if (result.credits.starPowerScore >= 60) {
    console.log('→ Strong cast - Recognizable names');
  } else if (result.credits.starPowerScore >= 40) {
    console.log('→ Moderate star power');
  } else if (result.credits.starPowerScore >= 20) {
    console.log('→ Limited star power');
  } else {
    console.log('→ Unknown cast');
  }

  if (result.credits.topStars.length > 0) {
    console.log(`\nTop Stars: ${result.credits.topStars.join(', ')}`);
  }

  console.log('\nFull Cast:');
  result.credits.cast.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (popularity: ${c.popularity.toFixed(1)}) as "${c.character}"`);
  });

  if (result.credits.crew.length > 0) {
    console.log('\nKey Crew:');
    result.credits.crew.slice(0, 5).forEach((c) => {
      console.log(`  - ${c.name} (${c.job})`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('Why Market Might Favor This Title:');
  console.log('='.repeat(60));

  const reasons: string[] = [];

  if (result.credits.starPowerScore >= 60) {
    reasons.push(`Strong star power (${result.credits.starPowerScore}/100) - ${result.credits.topStars.slice(0, 3).join(', ')}`);
  }

  const highPopCast = result.credits.cast.filter(c => c.popularity > 50);
  if (highPopCast.length > 0) {
    reasons.push(`${highPopCast.length} highly popular cast member(s) (50+ TMDB popularity)`);
  }

  const directors = result.credits.crew.filter(c => c.job === 'Director' || c.job === 'Creator');
  if (directors.some(d => d.popularity > 20)) {
    reasons.push(`Notable director/creator: ${directors.filter(d => d.popularity > 20).map(d => d.name).join(', ')}`);
  }

  if (reasons.length === 0) {
    reasons.push('No strong star power signals detected');
  }

  reasons.forEach((r, i) => console.log(`${i + 1}. ${r}`));
}

main().catch(console.error);
