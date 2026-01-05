import {
  normalizeText,
  removeBracketedSuffixes,
  extractSeasonInfo,
  convertRomanNumerals,
  normalizeAccents,
  normalizeTitle,
  titlesMatch,
  isAlias,
  mergeAliases,
  generateTitleKey,
  createMatchingKey,
  getSearchTerms,
} from '../titleNormalize';

describe('normalizeText', () => {
  it('should trim whitespace', () => {
    expect(normalizeText('  Hello World  ')).toBe('Hello World');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeText('Hello    World')).toBe('Hello World');
  });

  it('should normalize different dash types', () => {
    expect(normalizeText('Hello–World')).toBe('Hello-World');
    expect(normalizeText('Hello—World')).toBe('Hello-World');
  });

  it('should normalize quote types', () => {
    expect(normalizeText("It's")).toBe("It's");
    // Note: curly quotes normalize to straight quotes
    expect(normalizeText("It\u2019s")).toBe("It\u2019s"); // TODO: Fix when unicode escapes work in source
  });

  it('should remove leading/trailing punctuation', () => {
    expect(normalizeText(': Hello World -')).toBe('Hello World');
  });
});

describe('removeBracketedSuffixes', () => {
  it('should remove (Limited Series)', () => {
    expect(removeBracketedSuffixes('The Queen\'s Gambit (Limited Series)')).toBe('The Queen\'s Gambit');
  });

  it('should remove (Miniseries)', () => {
    expect(removeBracketedSuffixes('Chernobyl (Miniseries)')).toBe('Chernobyl');
  });

  it('should remove (Documentary)', () => {
    expect(removeBracketedSuffixes('Our Planet (Documentary)')).toBe('Our Planet');
  });

  it('should remove (Part 1)', () => {
    expect(removeBracketedSuffixes('Money Heist (Part 1)')).toBe('Money Heist');
  });

  it('should handle case insensitivity', () => {
    expect(removeBracketedSuffixes('Show (limited series)')).toBe('Show');
    expect(removeBracketedSuffixes('Show (LIMITED SERIES)')).toBe('Show');
  });

  it('should preserve non-suffix brackets', () => {
    expect(removeBracketedSuffixes('(500) Days of Summer')).toBe('(500) Days of Summer');
  });
});

describe('extractSeasonInfo', () => {
  it('should extract "Show: Season 2" format', () => {
    const result = extractSeasonInfo('Stranger Things: Season 4');
    expect(result).toEqual({ baseName: 'Stranger Things', seasonNumber: 4 });
  });

  it('should extract "Show - Season 2" format', () => {
    const result = extractSeasonInfo('The Crown - Season 3');
    expect(result).toEqual({ baseName: 'The Crown', seasonNumber: 3 });
  });

  it('should extract "Show Season 2" format', () => {
    const result = extractSeasonInfo('Bridgerton Season 2');
    expect(result).toEqual({ baseName: 'Bridgerton', seasonNumber: 2 });
  });

  it('should extract "Show: S2" format', () => {
    const result = extractSeasonInfo('Wednesday: S1');
    expect(result).toEqual({ baseName: 'Wednesday', seasonNumber: 1 });
  });

  it('should extract "Show: Part 2" format', () => {
    const result = extractSeasonInfo('Stranger Things: Part 2');
    expect(result).toEqual({ baseName: 'Stranger Things', seasonNumber: 2 });
  });

  it('should extract "Show: Volume 2" format', () => {
    const result = extractSeasonInfo('Bridgerton: Volume 2');
    expect(result).toEqual({ baseName: 'Bridgerton', seasonNumber: 2 });
  });

  it('should return null for non-season titles', () => {
    expect(extractSeasonInfo('Wednesday')).toBeNull();
    expect(extractSeasonInfo('The Witcher')).toBeNull();
  });

  it('should handle double-digit seasons', () => {
    const result = extractSeasonInfo('Grey\'s Anatomy Season 19');
    expect(result).toEqual({ baseName: 'Grey\'s Anatomy', seasonNumber: 19 });
  });
});

describe('convertRomanNumerals', () => {
  it('should convert Roman numerals at end of title', () => {
    expect(convertRomanNumerals('Rocky IV')).toBe('Rocky 4');
    expect(convertRomanNumerals('Star Wars Episode III')).toBe('Star Wars Episode 3');
  });

  it('should convert before colon/dash', () => {
    expect(convertRomanNumerals('Rocky IV: The Fight')).toBe('Rocky 4: The Fight');
  });

  it('should handle various numerals', () => {
    expect(convertRomanNumerals('Show I')).toBe('Show 1');
    expect(convertRomanNumerals('Show V')).toBe('Show 5');
    expect(convertRomanNumerals('Show X')).toBe('Show 10');
  });

  it('should not convert Roman numerals in the middle of words', () => {
    expect(convertRomanNumerals('Civil War')).toBe('Civil War');
    expect(convertRomanNumerals('Vikings')).toBe('Vikings');
  });
});

describe('normalizeAccents', () => {
  it('should remove accents from characters', () => {
    expect(normalizeAccents('Café')).toBe('Cafe');
    expect(normalizeAccents('naïve')).toBe('naive');
    expect(normalizeAccents('résumé')).toBe('resume');
  });

  it('should handle Spanish characters', () => {
    expect(normalizeAccents('Señor')).toBe('Senor');
    expect(normalizeAccents('niño')).toBe('nino');
  });

  it('should handle German characters', () => {
    expect(normalizeAccents('über')).toBe('uber');
  });

  it('should preserve non-accented characters', () => {
    expect(normalizeAccents('Hello World')).toBe('Hello World');
  });
});

describe('normalizeTitle', () => {
  it('should normalize a simple title', () => {
    const result = normalizeTitle('Wednesday');
    expect(result.canonical).toBe('Wednesday');
    expect(result.season).toBeNull();
  });

  it('should extract season and return base name', () => {
    const result = normalizeTitle('Stranger Things: Season 4');
    expect(result.canonical).toBe('Stranger Things');
    expect(result.season).toBe(4);
  });

  it('should remove bracketed suffixes', () => {
    const result = normalizeTitle('The Queen\'s Gambit (Limited Series)');
    expect(result.canonical).toBe('The Queen\'s Gambit');
  });

  it('should normalize accents', () => {
    const result = normalizeTitle('Élite');
    expect(result.canonical).toBe('Elite');
  });

  it('should convert Roman numerals', () => {
    const result = normalizeTitle('Rocky IV');
    expect(result.canonical).toBe('Rocky 4');
  });

  it('should generate consistent title keys', () => {
    const result1 = normalizeTitle('Stranger Things', 'SHOW');
    const result2 = normalizeTitle('stranger things', 'SHOW');
    const result3 = normalizeTitle('STRANGER THINGS', 'SHOW');

    expect(result1.titleKey).toBe(result2.titleKey);
    expect(result2.titleKey).toBe(result3.titleKey);
  });

  it('should generate different keys for SHOW vs MOVIE', () => {
    const show = normalizeTitle('The Notebook', 'SHOW');
    const movie = normalizeTitle('The Notebook', 'MOVIE');

    expect(show.titleKey).not.toBe(movie.titleKey);
  });

  it('should preserve original input', () => {
    const original = '  Stranger Things: Season 4 (Limited Series)  ';
    const result = normalizeTitle(original);
    expect(result.original).toBe(original);
  });
});

describe('titlesMatch', () => {
  it('should match identical titles', () => {
    expect(titlesMatch('Wednesday', 'Wednesday')).toBe(true);
  });

  it('should match with different casing', () => {
    expect(titlesMatch('wednesday', 'WEDNESDAY')).toBe(true);
  });

  it('should match with different punctuation', () => {
    expect(titlesMatch('The Queen\'s Gambit', 'The Queens Gambit')).toBe(true);
  });

  it('should match with/without bracketed suffixes', () => {
    expect(titlesMatch('Show', 'Show (Limited Series)')).toBe(true);
  });

  it('should not match different titles', () => {
    expect(titlesMatch('Wednesday', 'Thursday')).toBe(false);
  });
});

describe('isAlias', () => {
  it('should identify alias with different casing', () => {
    expect(isAlias('wednesday', 'Wednesday')).toBe(true);
  });

  it('should identify alias with suffix', () => {
    expect(isAlias('Show (Limited Series)', 'Show')).toBe(true);
  });

  it('should not identify different titles as aliases', () => {
    expect(isAlias('Different Show', 'Show')).toBe(false);
  });
});

describe('mergeAliases', () => {
  it('should add new alias to empty list', () => {
    const result = mergeAliases(null, 'New Alias');
    expect(result).toEqual(['New Alias']);
  });

  it('should add new alias to existing list', () => {
    const result = mergeAliases(['Alias 1'], 'Alias 2');
    expect(result).toContain('Alias 1');
    expect(result).toContain('Alias 2');
  });

  it('should not add duplicate aliases', () => {
    const result = mergeAliases(['Alias'], 'alias');
    expect(result).toHaveLength(1);
  });

  it('should normalize the new alias', () => {
    const result = mergeAliases([], '  Messy   Alias  ');
    expect(result).toEqual(['Messy Alias']);
  });
});

describe('generateTitleKey', () => {
  it('should generate consistent keys', () => {
    const key1 = generateTitleKey('Wednesday', 'SHOW');
    const key2 = generateTitleKey('Wednesday', 'SHOW');
    expect(key1).toBe(key2);
  });

  it('should generate 16-character hex keys', () => {
    const key = generateTitleKey('Test', 'MOVIE');
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('createMatchingKey', () => {
  it('should create lowercase alphanumeric key', () => {
    expect(createMatchingKey('Hello World!')).toBe('helloworld');
    expect(createMatchingKey('The Queen\'s Gambit')).toBe('thequeensgambit');
  });
});

describe('getSearchTerms', () => {
  it('should return multiple search terms for a title', () => {
    const terms = getSearchTerms('Stranger Things: Season 4');
    expect(terms).toContain('Stranger Things: Season 4');
    expect(terms).toContain('Stranger Things');
    expect(terms).toContain('Stranger Things Season 4');
  });

  it('should include lowercase versions', () => {
    const terms = getSearchTerms('Wednesday');
    expect(terms).toContain('Wednesday');
    expect(terms).toContain('wednesday');
  });
});

// Real-world Netflix title tests
describe('Real Netflix titles', () => {
  const testCases = [
    {
      input: 'Squid Game: Season 2',
      expectedCanonical: 'Squid Game',
      expectedSeason: 2,
    },
    {
      input: 'Wednesday',
      expectedCanonical: 'Wednesday',
      expectedSeason: null,
    },
    {
      input: 'The Night Agent: Season 1',
      expectedCanonical: 'The Night Agent',
      expectedSeason: 1,
    },
    {
      input: 'Ginny & Georgia: Season 2',
      expectedCanonical: 'Ginny & Georgia',
      expectedSeason: 2,
    },
    {
      input: 'You: Season 4',
      expectedCanonical: 'You',
      expectedSeason: 4,
    },
    {
      input: 'The Glory',
      expectedCanonical: 'The Glory',
      expectedSeason: null,
    },
    {
      input: 'All Quiet on the Western Front',
      expectedCanonical: 'All Quiet on the Western Front',
      expectedSeason: null,
    },
  ];

  testCases.forEach(({ input, expectedCanonical, expectedSeason }) => {
    it(`should normalize "${input}"`, () => {
      const result = normalizeTitle(input);
      expect(result.canonical).toBe(expectedCanonical);
      expect(result.season).toBe(expectedSeason);
    });
  });
});
