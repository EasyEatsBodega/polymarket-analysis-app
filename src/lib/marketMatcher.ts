/**
 * Market Matcher Library
 *
 * Matches Polymarket outcome names to Netflix titles using
 * normalized text comparison and fuzzy matching.
 */

import {
  createMatchingKey,
  normalizeText,
  removeBracketedSuffixes,
} from './titleNormalize';

export interface TitleCacheEntry {
  id: string;
  canonicalName: string;
  aliases: string[] | null;
}

export interface MarketOutcomeMatch {
  outcomeName: string;           // Raw from Polymarket
  matchedTitleId: string | null;
  matchedTitleName: string | null;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching when exact match fails
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create a 2D array to store distances
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest of the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Clean outcome name for matching
 * Handles Polymarket-specific formatting
 */
function cleanOutcomeName(name: string): string {
  let cleaned = name;

  // Remove common Polymarket suffixes
  cleaned = cleaned.replace(/\s*\(.*?\)\s*$/g, '');

  // Handle "Show: Season X" format
  cleaned = cleaned.replace(/:\s*Season\s+\d+$/i, '');

  // Apply standard normalization
  cleaned = normalizeText(removeBracketedSuffixes(cleaned));

  return cleaned;
}

/**
 * Match a Polymarket outcome name to a Netflix title
 *
 * Strategy:
 * 1. Exact match on normalized canonical name
 * 2. Exact match on any alias
 * 3. Fuzzy match using Levenshtein distance if no exact match
 */
export function matchOutcomeToTitle(
  outcomeName: string,
  titleCache: Map<string, TitleCacheEntry>
): MarketOutcomeMatch {
  const cleanedOutcome = cleanOutcomeName(outcomeName);
  const normalizedOutcome = createMatchingKey(cleanedOutcome);

  // Check exact match on canonical name
  for (const [, title] of titleCache) {
    const normalizedTitle = createMatchingKey(title.canonicalName);

    if (normalizedTitle === normalizedOutcome) {
      return {
        outcomeName,
        matchedTitleId: title.id,
        matchedTitleName: title.canonicalName,
        matchConfidence: 'exact',
      };
    }

    // Check aliases
    if (title.aliases) {
      for (const alias of title.aliases) {
        if (createMatchingKey(alias) === normalizedOutcome) {
          return {
            outcomeName,
            matchedTitleId: title.id,
            matchedTitleName: title.canonicalName,
            matchConfidence: 'exact',
          };
        }
      }
    }
  }

  // Fuzzy matching as fallback (Levenshtein distance <= 3)
  let bestMatch: { id: string; name: string; distance: number } | null = null;
  const MAX_DISTANCE = 3;

  for (const [, title] of titleCache) {
    const normalizedTitle = createMatchingKey(title.canonicalName);
    const distance = levenshteinDistance(normalizedOutcome, normalizedTitle);

    if (distance <= MAX_DISTANCE && (!bestMatch || distance < bestMatch.distance)) {
      bestMatch = { id: title.id, name: title.canonicalName, distance };
    }

    // Also check aliases for fuzzy match
    if (title.aliases) {
      for (const alias of title.aliases) {
        const normalizedAlias = createMatchingKey(alias);
        const aliasDistance = levenshteinDistance(normalizedOutcome, normalizedAlias);

        if (aliasDistance <= MAX_DISTANCE && (!bestMatch || aliasDistance < bestMatch.distance)) {
          bestMatch = { id: title.id, name: title.canonicalName, distance: aliasDistance };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      outcomeName,
      matchedTitleId: bestMatch.id,
      matchedTitleName: bestMatch.name,
      matchConfidence: 'fuzzy',
    };
  }

  return {
    outcomeName,
    matchedTitleId: null,
    matchedTitleName: null,
    matchConfidence: 'none',
  };
}

/**
 * Batch match multiple outcomes to titles
 */
export function matchOutcomesToTitles(
  outcomes: string[],
  titleCache: Map<string, TitleCacheEntry>
): Map<string, MarketOutcomeMatch> {
  const results = new Map<string, MarketOutcomeMatch>();

  for (const outcome of outcomes) {
    results.set(outcome, matchOutcomeToTitle(outcome, titleCache));
  }

  return results;
}

/**
 * Build a title cache from database records
 */
export function buildTitleCache(
  titles: Array<{ id: string; canonicalName: string; aliases: unknown }>
): Map<string, TitleCacheEntry> {
  const cache = new Map<string, TitleCacheEntry>();

  for (const title of titles) {
    cache.set(title.id, {
      id: title.id,
      canonicalName: title.canonicalName,
      aliases: Array.isArray(title.aliases) ? title.aliases as string[] : null,
    });
  }

  return cache;
}
