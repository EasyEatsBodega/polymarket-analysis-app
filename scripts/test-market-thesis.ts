/**
 * Test market thesis generation
 */

import { generateMarketThesis } from '../src/lib/marketThesis';

async function main() {
  const titles = [
    { name: 'His & Hers', type: 'SHOW' as const, genres: ['Mystery', 'Thriller', 'Drama'], trendsScore: 100 },
    { name: 'Stranger Things 5', type: 'SHOW' as const, genres: ['Sci-Fi', 'Horror', 'Drama'] },
    { name: 'Emily in Paris', type: 'SHOW' as const, genres: ['Comedy', 'Romance', 'Drama'] },
    { name: 'Run Away: Limited Series', type: 'SHOW' as const, genres: ['Drama'] },
  ];

  for (const title of titles) {
    console.log('\n' + '='.repeat(60));
    console.log(`${title.name}`);
    console.log('='.repeat(60));

    const thesis = await generateMarketThesis(title.name, title.type, {
      genres: title.genres,
      trendsScore: title.trendsScore,
    });

    console.log(`\nSummary: ${thesis.summary}`);
    console.log(`Confidence: ${thesis.confidence}`);
    console.log(`Star Power Score: ${thesis.starPowerScore}/100`);

    if (thesis.notableCast.length > 0) {
      console.log('\nNotable Cast:');
      thesis.notableCast.forEach((c) => {
        console.log(`  - ${c.name} (${c.tier}) - ${c.knownFor}`);
      });
    }

    if (thesis.signals.length > 0) {
      console.log('\nSignals:');
      thesis.signals.forEach((s) => {
        console.log(`  [${s.strength}] ${s.type}: ${s.description}`);
        if (s.details) console.log(`         ${s.details}`);
      });
    }
  }
}

main().catch(console.error);
