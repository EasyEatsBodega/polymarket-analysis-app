/**
 * Rotten Tomatoes Score Fetcher
 *
 * Fetches RT scores directly from their website since they don't have a public API.
 * Uses their internal JSON-LD structured data which is reliable and doesn't require scraping HTML.
 */

export interface RTScores {
  tomatometer: number | null; // Critic score (0-100)
  audienceScore: number | null; // Audience score (0-100)
  criticCount: number | null;
  audienceCount: number | null;
  consensus: string | null;
  url: string | null;
}

/**
 * Known RT URL slugs for titles
 * Format: title name -> { type: 'movie' | 'tv', slug: string }
 */
const RT_SLUG_MAP: Record<string, { type: 'movie' | 'tv'; slug: string }> = {
  // Netflix Polymarket titles
  'His & Hers': { type: 'tv', slug: 'his_and_hers' },
  'His and Hers': { type: 'tv', slug: 'his_and_hers' },
  'Run Away': { type: 'tv', slug: 'run_away' },
  'Run Away: Limited Series': { type: 'tv', slug: 'run_away' },
  'Stranger Things': { type: 'tv', slug: 'stranger_things' },
  'Emily in Paris': { type: 'tv', slug: 'emily_in_paris' },
  'Wake Up Dead Man': { type: 'movie', slug: 'wake_up_dead_man_a_knives_out_mystery' },
  'Wake Up Dead Man: A Knives Out Mystery': { type: 'movie', slug: 'wake_up_dead_man_a_knives_out_mystery' },
  'Priscilla': { type: 'movie', slug: 'priscilla' },
  '12 Years A Slave': { type: 'movie', slug: '12_years_a_slave' },
  'Pitch Perfect': { type: 'movie', slug: 'pitch_perfect' },
  'The Grinch': { type: 'movie', slug: 'the_grinch_2018' },
  'Madagascar': { type: 'movie', slug: 'madagascar' },
  'Unlocked: A Jail Experiment': { type: 'tv', slug: 'unlocked_a_jail_experiment' },
  '11.22.63': { type: 'tv', slug: '11_22_63' },
  'KPop Demon Hunters': { type: 'movie', slug: 'kpop_demon_hunters' },
  'People We Meet on Vacation': { type: 'movie', slug: 'people_we_meet_on_vacation' },
};

/**
 * Build RT URL from title info
 */
function buildRTUrl(type: 'movie' | 'tv', slug: string): string {
  if (type === 'movie') {
    return `https://www.rottentomatoes.com/m/${slug}`;
  }
  return `https://www.rottentomatoes.com/tv/${slug}`;
}

/**
 * Fetch RT scores for a title
 */
export async function fetchRTScores(titleName: string): Promise<RTScores | null> {
  // Check if we have a known slug
  const slugInfo = RT_SLUG_MAP[titleName];

  if (!slugInfo) {
    console.log(`RT: No known slug for "${titleName}"`);
    return null;
  }

  const url = buildRTUrl(slugInfo.type, slugInfo.slug);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.log(`RT: Failed to fetch ${url} - ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract scores from the page
    return parseRTPage(html, url);
  } catch (error) {
    console.error(`RT: Error fetching ${titleName}:`, error);
    return null;
  }
}

/**
 * Parse RT page to extract scores
 * Uses multiple fallback methods for reliability
 */
function parseRTPage(html: string, url: string): RTScores {
  const result: RTScores = {
    tomatometer: null,
    audienceScore: null,
    criticCount: null,
    audienceCount: null,
    consensus: null,
    url,
  };

  // Method 1: Look for JSON-LD structured data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd.aggregateRating) {
        result.tomatometer = Math.round(jsonLd.aggregateRating.ratingValue);
        result.criticCount = jsonLd.aggregateRating.ratingCount || null;
      }
    } catch {
      // JSON-LD parsing failed, continue to other methods
    }
  }

  // Method 2: Look for score-board or score-icon elements
  // Tomatometer score
  const tomatometerMatch = html.match(/tomatometer[^>]*>\s*(\d+)%/i);
  if (tomatometerMatch && !result.tomatometer) {
    result.tomatometer = parseInt(tomatometerMatch[1], 10);
  }

  // Alternative: data-audiencescore attribute
  const dataScoreMatch = html.match(/data-audiencescore="(\d+)"/);
  if (dataScoreMatch) {
    result.audienceScore = parseInt(dataScoreMatch[1], 10);
  }

  // Method 3: Look for score in slot elements (new RT design)
  const slotScoreMatch = html.match(/slot="audienceScore"[^>]*>(\d+)%/);
  if (slotScoreMatch) {
    result.audienceScore = parseInt(slotScoreMatch[1], 10);
  }

  const criticSlotMatch = html.match(/slot="criticsScore"[^>]*>(\d+)%/);
  if (criticSlotMatch && !result.tomatometer) {
    result.tomatometer = parseInt(criticSlotMatch[1], 10);
  }

  // Method 4: Look for consensus
  const consensusMatch = html.match(/data-qa="critics-consensus"[^>]*>([^<]+)/);
  if (consensusMatch) {
    result.consensus = consensusMatch[1].trim();
  }

  // Method 5: Simple percentage pattern near score keywords
  if (!result.tomatometer) {
    // Look for patterns like "Critics Consensus: 85%" or similar
    const simpleMatch = html.match(/critics?[^0-9]*(\d{1,3})%/i);
    if (simpleMatch) {
      const score = parseInt(simpleMatch[1], 10);
      if (score <= 100) {
        result.tomatometer = score;
      }
    }
  }

  if (!result.audienceScore) {
    const audienceMatch = html.match(/audience[^0-9]*(\d{1,3})%/i);
    if (audienceMatch) {
      const score = parseInt(audienceMatch[1], 10);
      if (score <= 100) {
        result.audienceScore = score;
      }
    }
  }

  return result;
}

/**
 * Add a new title-to-slug mapping
 */
export function addRTSlug(
  titleName: string,
  type: 'movie' | 'tv',
  slug: string
): void {
  RT_SLUG_MAP[titleName] = { type, slug };
}

/**
 * Check if we have a mapping for a title
 */
export function hasRTSlug(titleName: string): boolean {
  return titleName in RT_SLUG_MAP;
}
