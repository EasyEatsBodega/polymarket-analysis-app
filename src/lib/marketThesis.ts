/**
 * Market Thesis Generator
 *
 * Analyzes multiple signals to explain WHY a prediction market
 * might be pricing a title at a certain probability.
 *
 * This helps users understand market pricing beyond just the numbers.
 */

import { searchAndGetCredits, TitleCredits } from './tmdbCast';

// =============================================================================
// NOTABLE CAST DATABASE
// =============================================================================

/**
 * Known actors/actresses with significant name recognition.
 * TMDB popularity fluctuates, but these are objectively "famous".
 *
 * Categories:
 *   A_LIST: Major movie stars, household names
 *   NOTABLE: Recognizable from major TV shows or supporting film roles
 *   RISING: Up-and-coming stars with growing recognition
 */
export const NOTABLE_CAST: Record<string, { tier: 'A_LIST' | 'NOTABLE' | 'RISING'; knownFor: string }> = {
  // A-LIST - Household names
  'Tessa Thompson': { tier: 'A_LIST', knownFor: 'Thor, Creed, Westworld' },
  'Jon Bernthal': { tier: 'A_LIST', knownFor: 'The Punisher, Walking Dead' },
  'Millie Bobby Brown': { tier: 'A_LIST', knownFor: 'Stranger Things, Enola Holmes' },
  'Adam Sandler': { tier: 'A_LIST', knownFor: 'Happy Gilmore, Uncut Gems' },
  'Jennifer Aniston': { tier: 'A_LIST', knownFor: 'Friends, The Morning Show' },
  'Reese Witherspoon': { tier: 'A_LIST', knownFor: 'Big Little Lies, Legally Blonde' },
  'Ryan Reynolds': { tier: 'A_LIST', knownFor: 'Deadpool, Free Guy' },
  'Dwayne Johnson': { tier: 'A_LIST', knownFor: 'Fast & Furious, Jumanji' },
  'Leonardo DiCaprio': { tier: 'A_LIST', knownFor: 'Titanic, The Revenant' },
  'Chris Hemsworth': { tier: 'A_LIST', knownFor: 'Thor, Extraction' },
  'Scarlett Johansson': { tier: 'A_LIST', knownFor: 'Black Widow, Marriage Story' },
  'Tom Hanks': { tier: 'A_LIST', knownFor: 'Forrest Gump, Cast Away' },
  'Denzel Washington': { tier: 'A_LIST', knownFor: 'Training Day, The Equalizer' },
  'Sandra Bullock': { tier: 'A_LIST', knownFor: 'The Blind Side, Gravity' },
  'Julia Roberts': { tier: 'A_LIST', knownFor: 'Pretty Woman, Erin Brockovich' },
  'Will Smith': { tier: 'A_LIST', knownFor: 'Men in Black, The Pursuit of Happyness' },
  'Brad Pitt': { tier: 'A_LIST', knownFor: 'Fight Club, Once Upon a Time' },
  'Margot Robbie': { tier: 'A_LIST', knownFor: 'Barbie, Wolf of Wall Street' },
  'Zendaya': { tier: 'A_LIST', knownFor: 'Euphoria, Spider-Man, Dune' },
  'Timothée Chalamet': { tier: 'A_LIST', knownFor: 'Dune, Call Me by Your Name' },
  'Florence Pugh': { tier: 'A_LIST', knownFor: 'Black Widow, Midsommar' },
  'Pedro Pascal': { tier: 'A_LIST', knownFor: 'The Last of Us, Mandalorian' },
  'Jenna Ortega': { tier: 'A_LIST', knownFor: 'Wednesday, Scream' },

  // NOTABLE - Recognizable stars
  'Pablo Schreiber': { tier: 'NOTABLE', knownFor: 'Halo, Orange is the New Black' },
  'Crystal Fox': { tier: 'NOTABLE', knownFor: 'Big Little Lies, In the Heat of the Night' },
  'Lily Collins': { tier: 'NOTABLE', knownFor: 'Emily in Paris' },
  'Penn Badgley': { tier: 'NOTABLE', knownFor: 'You, Gossip Girl' },
  'Henry Cavill': { tier: 'NOTABLE', knownFor: 'The Witcher, Superman' },
  'Anya Taylor-Joy': { tier: 'NOTABLE', knownFor: "The Queen's Gambit, Furiosa" },
  'Sydney Sweeney': { tier: 'NOTABLE', knownFor: 'Euphoria, Anyone But You' },
  'Jacob Elordi': { tier: 'NOTABLE', knownFor: 'Euphoria, Saltburn' },
  'Austin Butler': { tier: 'NOTABLE', knownFor: 'Elvis, Dune Part Two' },
  'Glen Powell': { tier: 'NOTABLE', knownFor: 'Top Gun: Maverick, Anyone But You' },
  'Winona Ryder': { tier: 'NOTABLE', knownFor: 'Stranger Things, Beetlejuice' },
  'David Harbour': { tier: 'NOTABLE', knownFor: 'Stranger Things, Black Widow' },
  'Finn Wolfhard': { tier: 'NOTABLE', knownFor: 'Stranger Things, IT' },

  // RISING - Up-and-coming
  'Maitreyi Ramakrishnan': { tier: 'RISING', knownFor: 'Never Have I Ever' },
  'Chase Stokes': { tier: 'RISING', knownFor: 'Outer Banks' },
  'Madelyn Cline': { tier: 'RISING', knownFor: 'Outer Banks, Glass Onion' },
};

// =============================================================================
// MARKET THESIS SIGNALS
// =============================================================================

export interface MarketSignal {
  type: 'STAR_POWER' | 'SOURCE_MATERIAL' | 'GENRE' | 'TIMING' | 'BUZZ' | 'TRACK_RECORD' | 'MARKETING';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  description: string;
  details?: string;
}

export interface MarketThesis {
  summary: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  signals: MarketSignal[];
  notableCast: Array<{ name: string; tier: string; knownFor: string }>;
  starPowerScore: number;
}

/**
 * Known source material that adds value
 */
const KNOWN_SOURCE_MATERIAL: Record<string, string> = {
  'His & Hers': 'Alice Feeney bestselling novel',
  'Stranger Things': 'Original IP with massive fanbase',
  'Wednesday': 'Addams Family IP',
  'The Witcher': 'Popular book series and video game',
  'Bridgerton': 'Julia Quinn novel series',
  'You': 'Caroline Kepnes novel',
  'Emily in Paris': 'Original IP, Sex and the City creator',
  'Squid Game': 'Original IP, cultural phenomenon',
};

/**
 * Genre appeal on Netflix (based on historical performance)
 */
const GENRE_APPEAL: Record<string, { appeal: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string }> = {
  'thriller': { appeal: 'HIGH', reason: 'Thrillers consistently dominate Netflix Top 10' },
  'psychological thriller': { appeal: 'HIGH', reason: 'Psychological thrillers are Netflix\'s bread and butter' },
  'mystery': { appeal: 'HIGH', reason: 'Mystery shows generate strong engagement' },
  'true crime': { appeal: 'HIGH', reason: 'True crime is a top-performing genre on Netflix' },
  'romance': { appeal: 'HIGH', reason: 'Romance content has broad appeal' },
  'romantic comedy': { appeal: 'HIGH', reason: 'Rom-coms perform well, especially new releases' },
  'action': { appeal: 'MEDIUM', reason: 'Action does well but faces more competition' },
  'drama': { appeal: 'MEDIUM', reason: 'Drama is competitive but can break out' },
  'comedy': { appeal: 'MEDIUM', reason: 'Comedy performance varies widely' },
  'horror': { appeal: 'MEDIUM', reason: 'Horror has dedicated audience but niche' },
  'documentary': { appeal: 'LOW', reason: 'Documentaries rarely hit #1 unless viral' },
  'anime': { appeal: 'LOW', reason: 'Anime has dedicated but smaller audience' },
};

// =============================================================================
// THESIS GENERATION
// =============================================================================

/**
 * Analyze cast for notable actors
 */
function analyzeNotableCast(
  cast: TitleCredits['cast']
): Array<{ name: string; tier: string; knownFor: string }> {
  const notable: Array<{ name: string; tier: string; knownFor: string }> = [];

  for (const member of cast) {
    const info = NOTABLE_CAST[member.name];
    if (info) {
      notable.push({
        name: member.name,
        tier: info.tier,
        knownFor: info.knownFor,
      });
    }
  }

  return notable;
}

/**
 * Generate star power signal
 */
function generateStarPowerSignal(
  notableCast: Array<{ name: string; tier: string; knownFor: string }>,
  tmdbScore: number
): MarketSignal | null {
  const aListCount = notableCast.filter((c) => c.tier === 'A_LIST').length;
  const notableCount = notableCast.filter((c) => c.tier === 'NOTABLE').length;

  if (aListCount >= 2) {
    return {
      type: 'STAR_POWER',
      strength: 'STRONG',
      description: `A-list ensemble cast with ${aListCount} major stars`,
      details: notableCast
        .filter((c) => c.tier === 'A_LIST')
        .map((c) => `${c.name} (${c.knownFor})`)
        .join(', '),
    };
  }

  if (aListCount === 1) {
    const star = notableCast.find((c) => c.tier === 'A_LIST')!;
    return {
      type: 'STAR_POWER',
      strength: 'STRONG',
      description: `Led by ${star.name}`,
      details: star.knownFor,
    };
  }

  if (notableCount >= 2) {
    return {
      type: 'STAR_POWER',
      strength: 'MODERATE',
      description: `Recognizable cast with ${notableCount} notable actors`,
      details: notableCast.map((c) => c.name).join(', '),
    };
  }

  if (notableCount === 1) {
    const actor = notableCast[0];
    return {
      type: 'STAR_POWER',
      strength: 'WEAK',
      description: `Features ${actor.name}`,
      details: actor.knownFor,
    };
  }

  return null;
}

/**
 * Generate source material signal
 */
function generateSourceMaterialSignal(titleName: string): MarketSignal | null {
  // Check exact match first
  if (KNOWN_SOURCE_MATERIAL[titleName]) {
    return {
      type: 'SOURCE_MATERIAL',
      strength: 'STRONG',
      description: `Based on ${KNOWN_SOURCE_MATERIAL[titleName]}`,
    };
  }

  // Check partial matches (for sequels like "Stranger Things 5")
  for (const [key, value] of Object.entries(KNOWN_SOURCE_MATERIAL)) {
    if (titleName.includes(key) || key.includes(titleName)) {
      return {
        type: 'SOURCE_MATERIAL',
        strength: 'STRONG',
        description: `Based on ${value}`,
      };
    }
  }

  return null;
}

/**
 * Generate genre signal
 */
function generateGenreSignal(genres: string[]): MarketSignal | null {
  for (const genre of genres) {
    const genreLower = genre.toLowerCase();
    for (const [key, value] of Object.entries(GENRE_APPEAL)) {
      if (genreLower.includes(key) || key.includes(genreLower)) {
        return {
          type: 'GENRE',
          strength: value.appeal === 'HIGH' ? 'STRONG' : value.appeal === 'MEDIUM' ? 'MODERATE' : 'WEAK',
          description: value.reason,
          details: genre,
        };
      }
    }
  }
  return null;
}

/**
 * Generate buzz signal from pre-release data
 */
function generateBuzzSignal(
  trendsScore: number | null,
  trailerViews: number | null
): MarketSignal | null {
  if (trendsScore && trendsScore >= 80) {
    return {
      type: 'BUZZ',
      strength: 'STRONG',
      description: 'High pre-release search interest',
      details: `Google Trends score: ${trendsScore}/100`,
    };
  }

  if (trailerViews && trailerViews >= 10000000) {
    return {
      type: 'BUZZ',
      strength: 'STRONG',
      description: 'Trailer has 10M+ views',
      details: `${(trailerViews / 1000000).toFixed(1)}M trailer views`,
    };
  }

  if (trailerViews && trailerViews >= 1000000) {
    return {
      type: 'BUZZ',
      strength: 'MODERATE',
      description: 'Trailer has 1M+ views',
      details: `${(trailerViews / 1000000).toFixed(1)}M trailer views`,
    };
  }

  if (trendsScore && trendsScore >= 50) {
    return {
      type: 'BUZZ',
      strength: 'MODERATE',
      description: 'Moderate pre-release interest',
      details: `Google Trends score: ${trendsScore}/100`,
    };
  }

  return null;
}

/**
 * Calculate overall star power score that accounts for notable cast
 */
function calculateEnhancedStarPower(
  notableCast: Array<{ name: string; tier: string }>,
  tmdbScore: number
): number {
  // Base score from TMDB
  let score = tmdbScore;

  // Boost for notable cast members
  for (const member of notableCast) {
    if (member.tier === 'A_LIST') {
      score += 25;
    } else if (member.tier === 'NOTABLE') {
      score += 15;
    } else if (member.tier === 'RISING') {
      score += 8;
    }
  }

  return Math.min(100, score);
}

/**
 * Generate complete market thesis for a title
 */
export async function generateMarketThesis(
  titleName: string,
  type: 'MOVIE' | 'SHOW',
  options?: {
    genres?: string[];
    trendsScore?: number;
    trailerViews?: number;
  }
): Promise<MarketThesis> {
  const signals: MarketSignal[] = [];
  let notableCast: Array<{ name: string; tier: string; knownFor: string }> = [];
  let tmdbStarPower = 0;

  // Fetch TMDB credits
  try {
    const result = await searchAndGetCredits(titleName, type);
    if (result) {
      notableCast = analyzeNotableCast(result.credits.cast);
      tmdbStarPower = result.credits.starPowerScore;
    }
  } catch (error) {
    console.error('Failed to fetch TMDB credits:', error);
  }

  // Generate star power signal
  const starPowerSignal = generateStarPowerSignal(notableCast, tmdbStarPower);
  if (starPowerSignal) signals.push(starPowerSignal);

  // Generate source material signal
  const sourceSignal = generateSourceMaterialSignal(titleName);
  if (sourceSignal) signals.push(sourceSignal);

  // Generate genre signal
  if (options?.genres) {
    const genreSignal = generateGenreSignal(options.genres);
    if (genreSignal) signals.push(genreSignal);
  }

  // Generate buzz signal
  const buzzSignal = generateBuzzSignal(
    options?.trendsScore ?? null,
    options?.trailerViews ?? null
  );
  if (buzzSignal) signals.push(buzzSignal);

  // Calculate enhanced star power
  const starPowerScore = calculateEnhancedStarPower(notableCast, tmdbStarPower);

  // Determine confidence based on signal count and strength
  const strongSignals = signals.filter((s) => s.strength === 'STRONG').length;
  const totalSignals = signals.length;

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (strongSignals >= 2 || (strongSignals >= 1 && totalSignals >= 3)) {
    confidence = 'HIGH';
  } else if (totalSignals >= 2 || strongSignals >= 1) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  // Generate summary
  let summary: string;
  if (signals.length === 0) {
    summary = 'Limited data available to explain market pricing.';
  } else if (strongSignals >= 2) {
    const topSignals = signals.filter((s) => s.strength === 'STRONG').slice(0, 2);
    summary = topSignals.map((s) => s.description).join('. ') + '.';
  } else if (signals.length > 0) {
    summary = signals[0].description + '.';
    if (signals.length > 1) {
      summary += ` Also: ${signals[1].description.toLowerCase()}.`;
    }
  } else {
    summary = 'Market pricing may be based on factors not yet captured in our data.';
  }

  return {
    summary,
    confidence,
    signals,
    notableCast,
    starPowerScore,
  };
}

/**
 * Quick thesis for display in cards (doesn't fetch TMDB)
 */
export function generateQuickThesis(
  titleName: string,
  options?: {
    genres?: string[];
    trendsScore?: number;
  }
): { summary: string; hasStrongSignal: boolean } {
  const signals: string[] = [];

  // Check source material
  if (KNOWN_SOURCE_MATERIAL[titleName]) {
    signals.push(`Based on ${KNOWN_SOURCE_MATERIAL[titleName]}`);
  }

  // Check for known franchises
  const franchiseKeywords = ['Stranger Things', 'Wednesday', 'Squid Game', 'Bridgerton', 'You', 'Emily in Paris'];
  for (const franchise of franchiseKeywords) {
    if (titleName.includes(franchise)) {
      signals.push('Part of a popular franchise');
      break;
    }
  }

  // Check trends
  if (options?.trendsScore && options.trendsScore >= 80) {
    signals.push('High pre-release buzz');
  }

  return {
    summary: signals.length > 0 ? signals.join('. ') : 'New release',
    hasStrongSignal: signals.length > 0,
  };
}
