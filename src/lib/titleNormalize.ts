/**
 * Title Normalization Library
 *
 * Handles normalization of Netflix title names for consistent matching and storage.
 * - Normalizes whitespace, punctuation, and casing
 * - Removes bracketed suffixes like "(Limited Series)"
 * - Handles season variants
 * - Generates deterministic title keys
 */

import crypto from 'crypto';

// Common bracketed suffixes to remove
const BRACKETED_SUFFIXES = [
  /\s*\(Limited Series\)\s*$/i,
  /\s*\(Miniseries\)\s*$/i,
  /\s*\(Mini-Series\)\s*$/i,
  /\s*\(TV Series\)\s*$/i,
  /\s*\(Series\)\s*$/i,
  /\s*\(Film\)\s*$/i,
  /\s*\(Movie\)\s*$/i,
  /\s*\(Documentary\)\s*$/i,
  /\s*\(Docuseries\)\s*$/i,
  /\s*\(Part \d+\)\s*$/i,
  /\s*\(Volume \d+\)\s*$/i,
];

// Season patterns to detect and extract
const SEASON_PATTERNS = [
  // "Show Name: Season 2" or "Show Name - Season 2"
  /^(.+?)[\s]*[:–-][\s]*Season[\s]+(\d+)$/i,
  // "Show Name Season 2"
  /^(.+?)[\s]+Season[\s]+(\d+)$/i,
  // "Show Name: S2" or "Show Name - S2"
  /^(.+?)[\s]*[:–-][\s]*S(\d+)$/i,
  // "Show Name S2"
  /^(.+?)[\s]+S(\d+)$/i,
  // "Show Name: Part 2" (for shows like Stranger Things)
  /^(.+?)[\s]*[:–-][\s]*Part[\s]+(\d+)$/i,
  // "Show Name Part 2"
  /^(.+?)[\s]+Part[\s]+(\d+)$/i,
  // "Show Name: Volume 2" (for shows like Bridgerton)
  /^(.+?)[\s]*[:–-][\s]*Volume[\s]+(\d+)$/i,
  // "Show Name Volume 2"
  /^(.+?)[\s]+Volume[\s]+(\d+)$/i,
];

// Roman numeral mapping
const ROMAN_NUMERALS: Record<string, number> = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
  'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
  'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15,
};

// Reverse mapping
const NUMBER_TO_ROMAN: Record<number, string> = Object.fromEntries(
  Object.entries(ROMAN_NUMERALS).map(([k, v]) => [v, k])
);

export interface NormalizedTitle {
  canonical: string;        // The canonical/base title name
  normalized: string;       // Fully normalized version for matching
  season: number | null;    // Extracted season number, if any
  original: string;         // Original input
  titleKey: string;         // Deterministic hash key
}

export interface SeasonInfo {
  baseName: string;
  seasonNumber: number;
}

/**
 * Normalize basic text: trim, collapse whitespace, handle common punctuation
 */
export function normalizeText(text: string): string {
  return text
    // Trim whitespace
    .trim()
    // Collapse multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Normalize different dash types to standard hyphen
    .replace(/[–—]/g, '-')
    // Normalize different quote types
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Remove leading/trailing punctuation that's not part of the title
    .replace(/^[:\-–—,.\s]+/, '')
    .replace(/[:\-–—,.\s]+$/, '');
}

/**
 * Remove common bracketed suffixes from title
 */
export function removeBracketedSuffixes(title: string): string {
  let result = title;
  for (const pattern of BRACKETED_SUFFIXES) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * Extract season information from a title
 * Returns the base name and season number if found
 */
export function extractSeasonInfo(title: string): SeasonInfo | null {
  for (const pattern of SEASON_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      return {
        baseName: normalizeText(match[1]),
        seasonNumber: parseInt(match[2], 10),
      };
    }
  }
  return null;
}

/**
 * Convert Roman numerals to Arabic numbers in a title
 * Only converts if it looks like a sequel number (e.g., "Rocky IV" -> "Rocky 4")
 */
export function convertRomanNumerals(title: string): string {
  // Match Roman numerals at the end of the title or before a colon/dash
  const romanPattern = /\b(X{0,3})(IX|IV|V?I{0,3})\b(?=\s*$|\s*[:–-])/i;

  return title.replace(romanPattern, (match) => {
    const upper = match.toUpperCase();
    if (ROMAN_NUMERALS[upper]) {
      return ROMAN_NUMERALS[upper].toString();
    }
    return match;
  });
}

/**
 * Normalize accented characters to their ASCII equivalents
 */
export function normalizeAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Generate a deterministic key for a title
 * Used for stable identification across different name variants
 */
export function generateTitleKey(canonical: string, type: 'SHOW' | 'MOVIE'): string {
  const normalized = canonical
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const input = `${normalized}:${type}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Create a normalized version of the title for fuzzy matching
 */
export function createMatchingKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Full title normalization pipeline
 */
export function normalizeTitle(
  title: string,
  type: 'SHOW' | 'MOVIE' = 'SHOW'
): NormalizedTitle {
  // Step 1: Basic text normalization
  let processed = normalizeText(title);

  // Step 2: Remove bracketed suffixes
  processed = removeBracketedSuffixes(processed);

  // Step 3: Handle accents
  const withoutAccents = normalizeAccents(processed);

  // Step 4: Convert Roman numerals (for consistency)
  const withArabicNumerals = convertRomanNumerals(withoutAccents);

  // Step 5: Extract season information
  const seasonInfo = extractSeasonInfo(withArabicNumerals);

  // Determine canonical name (base name without season)
  const canonical = seasonInfo ? seasonInfo.baseName : withArabicNumerals;

  // Create normalized version for matching (lowercase, alphanumeric only)
  const normalized = createMatchingKey(canonical);

  // Generate deterministic key
  const titleKey = generateTitleKey(canonical, type);

  return {
    canonical,
    normalized,
    season: seasonInfo?.seasonNumber ?? null,
    original: title,
    titleKey,
  };
}

/**
 * Check if two titles are likely the same (fuzzy match)
 */
export function titlesMatch(title1: string, title2: string): boolean {
  const key1 = createMatchingKey(normalizeText(removeBracketedSuffixes(title1)));
  const key2 = createMatchingKey(normalizeText(removeBracketedSuffixes(title2)));
  return key1 === key2;
}

/**
 * Check if a title is likely an alias of another
 * Returns true if they normalize to the same base name
 */
export function isAlias(newTitle: string, existingCanonical: string): boolean {
  const newNormalized = normalizeTitle(newTitle);
  const existingNormalized = createMatchingKey(existingCanonical);
  return newNormalized.normalized === existingNormalized;
}

/**
 * Merge aliases into a set, ensuring no duplicates
 */
export function mergeAliases(
  existingAliases: string[] | null,
  newAlias: string
): string[] {
  const aliases = new Set(existingAliases || []);
  const normalizedNew = normalizeText(newAlias);

  // Don't add if it's essentially the same as an existing alias
  const newKey = createMatchingKey(normalizedNew);
  for (const existing of aliases) {
    if (createMatchingKey(existing) === newKey) {
      return Array.from(aliases);
    }
  }

  aliases.add(normalizedNew);
  return Array.from(aliases);
}

/**
 * Get all possible search terms for a title (including variations)
 */
export function getSearchTerms(title: string): string[] {
  const terms = new Set<string>();
  const normalized = normalizeTitle(title);

  // Add original
  terms.add(title);

  // Add canonical
  terms.add(normalized.canonical);

  // Add with season if applicable
  if (normalized.season) {
    terms.add(`${normalized.canonical} Season ${normalized.season}`);
    terms.add(`${normalized.canonical}: Season ${normalized.season}`);
    terms.add(`${normalized.canonical} S${normalized.season}`);
  }

  // Add lowercase versions
  terms.add(title.toLowerCase());
  terms.add(normalized.canonical.toLowerCase());

  return Array.from(terms);
}
