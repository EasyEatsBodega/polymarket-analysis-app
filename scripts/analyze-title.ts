/**
 * Analyze a title's data to understand market pricing
 */

import prisma from '../src/lib/prisma';

async function main() {
  const searchTerm = process.argv[2] || 'His';

  const title = await prisma.title.findFirst({
    where: { canonicalName: { contains: searchTerm, mode: 'insensitive' } },
    include: {
      weeklyGlobal: { orderBy: { weekStart: 'desc' }, take: 5 },
      weeklyUS: { orderBy: { weekStart: 'desc' }, take: 5 },
      dailySignals: { orderBy: { date: 'desc' }, take: 10 },
      flixPatrolTrailers: { orderBy: { fetchedAt: 'desc' }, take: 5 },
      flixPatrolSocial: { orderBy: { fetchedAt: 'desc' }, take: 5 },
      externalIds: true,
      marketLinks: {
        include: {
          market: {
            include: {
              prices: { orderBy: { timestamp: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!title) {
    console.log('Title not found for:', searchTerm);
    await prisma.$disconnect();
    return;
  }

  console.log('='.repeat(60));
  console.log(`${title.canonicalName} - Data Analysis`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Basic Info:');
  console.log(`  Type: ${title.type}`);
  console.log(`  TMDB ID: ${title.tmdbId || 'Not linked'}`);
  console.log(`  External IDs: ${title.externalIds.map(e => `${e.provider}: ${e.externalId}`).join(', ') || 'None'}`);

  console.log('');
  console.log('Netflix Rankings:');
  console.log(`  Global: ${title.weeklyGlobal.length} weeks of data`);
  title.weeklyGlobal.forEach(w =>
    console.log(`    ${w.weekStart.toISOString().split('T')[0]}: #${w.rank} (${w.category})`)
  );
  console.log(`  US: ${title.weeklyUS.length} weeks of data`);
  title.weeklyUS.forEach(w =>
    console.log(`    ${w.weekStart.toISOString().split('T')[0]}: #${w.rank} (${w.category})`)
  );

  console.log('');
  console.log('Interest Signals:');
  console.log(`  Total: ${title.dailySignals.length} data points`);
  const bySource = new Map<string, typeof title.dailySignals>();
  title.dailySignals.forEach(s => {
    const key = `${s.source}-${s.geo}`;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(s);
  });
  bySource.forEach((signals, key) => {
    const latest = signals[0];
    console.log(`    ${key}: ${latest?.value ?? 'N/A'} (latest)`);
  });

  console.log('');
  console.log('FlixPatrol Data:');
  console.log(`  Trailers: ${title.flixPatrolTrailers.length}`);
  title.flixPatrolTrailers.forEach(t =>
    console.log(`    "${t.trailerTitle}": ${t.views?.toLocaleString()} views, ${t.likes?.toLocaleString()} likes`)
  );
  console.log(`  Social: ${title.flixPatrolSocial.length} platforms`);
  title.flixPatrolSocial.forEach(s =>
    console.log(`    ${s.platform}: ${s.followers?.toLocaleString()} followers`)
  );

  console.log('');
  console.log('Polymarket Links:');
  console.log(`  Linked Markets: ${title.marketLinks.length}`);
  title.marketLinks.forEach(link => {
    const market = link.market;
    const prices = market.prices[0]?.prices as Record<string, number> | null;
    console.log(`    ${market.question}`);
    if (prices) {
      const titlePrice = prices[title.canonicalName];
      if (titlePrice !== undefined) {
        console.log(`    → Current price: ${(titlePrice * 100).toFixed(1)}%`);
      }
    }
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('ANALYSIS: Why might the market favor this title?');
  console.log('='.repeat(60));

  const signals: string[] = [];
  const gaps: string[] = [];

  // Check what data we have vs don't have
  if (title.weeklyGlobal.length === 0 && title.weeklyUS.length === 0) {
    gaps.push('No Netflix ranking history (new release)');
  }

  if (title.dailySignals.length === 0) {
    gaps.push('No Google Trends or Wikipedia data');
  }

  if (title.flixPatrolTrailers.length > 0) {
    const totalViews = title.flixPatrolTrailers.reduce((sum, t) => sum + (t.views || 0), 0);
    if (totalViews > 1000000) {
      signals.push(`Strong trailer performance: ${totalViews.toLocaleString()} total views`);
    } else if (totalViews > 100000) {
      signals.push(`Moderate trailer views: ${totalViews.toLocaleString()}`);
    }
  } else {
    gaps.push('No trailer data from FlixPatrol');
  }

  if (title.flixPatrolSocial.length > 0) {
    const totalFollowers = title.flixPatrolSocial.reduce((sum, s) => sum + (s.followers || 0), 0);
    signals.push(`Social following: ${totalFollowers.toLocaleString()} across ${title.flixPatrolSocial.length} platforms`);
  }

  if (!title.tmdbId) {
    gaps.push('No TMDB link (missing cast/crew data)');
  }

  console.log('');
  console.log('Available Signals:');
  if (signals.length === 0) {
    console.log('  ⚠️  No strong signals available');
  } else {
    signals.forEach(s => console.log(`  ✓ ${s}`));
  }

  console.log('');
  console.log('Data Gaps (need to fill):');
  gaps.forEach(g => console.log(`  ✗ ${g}`));

  console.log('');
  console.log('Recommended Data Sources to Add:');
  console.log('  1. TMDB API - Get cast popularity scores, genre, runtime');
  console.log('  2. Pre-release Google Trends - Search interest before launch');
  console.log('  3. Social media mentions - Twitter/X, Instagram buzz');
  console.log('  4. News article count - Press coverage volume');
  console.log('  5. Netflix homepage position - Is it being promoted?');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
