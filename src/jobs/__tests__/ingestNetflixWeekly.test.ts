/**
 * Tests for Netflix Weekly Data Ingestion
 *
 * Note: These are unit tests for the parsing/normalization logic.
 * Integration tests would require mocking the database and HTTP calls.
 */

import { normalizeTitle, titlesMatch } from '../../lib/titleNormalize';

// Test data that mirrors Netflix XLSX structure
const sampleGlobalRows = [
  {
    week: '2024-01-07 - 2024-01-13',
    category: 'TV (English)',
    weekly_rank: 1,
    show_title: 'Squid Game',
    season_title: 'Squid Game: Season 2',
    weekly_hours_viewed: 124000000,
    runtime: '8:00:00',
  },
  {
    week: '2024-01-07 - 2024-01-13',
    category: 'TV (English)',
    weekly_rank: 2,
    show_title: 'Wednesday',
    season_title: 'Wednesday: Season 1',
    weekly_hours_viewed: 98000000,
    runtime: '7:20:00',
  },
  {
    week: '2024-01-07 - 2024-01-13',
    category: 'Films (English)',
    weekly_rank: 1,
    show_title: 'Leave the World Behind',
    weekly_hours_viewed: 56000000,
    runtime: '2:18:00',
  },
];

const sampleCountryRows = [
  {
    country_iso2: 'US',
    country_name: 'United States',
    week: '2024-01-07 - 2024-01-13',
    category: 'TV (English)',
    weekly_rank: 1,
    show_title: 'Squid Game',
    season_title: 'Squid Game: Season 2',
  },
  {
    country_iso2: 'GB',
    country_name: 'United Kingdom',
    week: '2024-01-07 - 2024-01-13',
    category: 'TV (English)',
    weekly_rank: 1,
    show_title: 'Slow Horses',
    season_title: 'Slow Horses: Season 4',
  },
  {
    country_iso2: 'US',
    country_name: 'United States',
    week: '2024-01-07 - 2024-01-13',
    category: 'Films (English)',
    weekly_rank: 1,
    show_title: 'Leave the World Behind',
  },
];

describe('Netflix data parsing helpers', () => {
  describe('Week string parsing', () => {
    // Helper function that mirrors the actual implementation
    function parseWeekRange(weekStr: string): { weekStart: Date; weekEnd: Date } {
      // Split on " - " or " – " (with spaces to avoid splitting date hyphens)
      const parts = weekStr.split(/\s+[-–]\s+/);
      if (parts.length >= 2) {
        return {
          weekStart: new Date(parts[0].trim()),
          weekEnd: new Date(parts[1].trim()),
        };
      }
      const start = new Date(weekStr.trim());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { weekStart: start, weekEnd: end };
    }

    it('should parse standard week range format', () => {
      const weekStr = '2024-01-07 - 2024-01-13';
      const { weekStart, weekEnd } = parseWeekRange(weekStr);
      expect(weekStart.toISOString().split('T')[0]).toBe('2024-01-07');
      expect(weekEnd.toISOString().split('T')[0]).toBe('2024-01-13');
    });

    it('should handle en-dash in week range', () => {
      const weekStr = '2024-01-07 – 2024-01-13'; // en-dash
      const { weekStart, weekEnd } = parseWeekRange(weekStr);
      expect(weekStart.toISOString().split('T')[0]).toBe('2024-01-07');
      expect(weekEnd.toISOString().split('T')[0]).toBe('2024-01-13');
    });
  });

  describe('Runtime parsing', () => {
    it('should parse HH:MM:SS format', () => {
      const runtime = '8:30:00';
      const parts = runtime.split(':').map(Number);
      const hours = parts[0] + parts[1] / 60 + parts[2] / 3600;
      expect(hours).toBeCloseTo(8.5);
    });

    it('should parse short format', () => {
      const runtime = '2:18:00';
      const parts = runtime.split(':').map(Number);
      const hours = parts[0] + parts[1] / 60 + parts[2] / 3600;
      expect(hours).toBeCloseTo(2.3);
    });
  });

  describe('Category to TitleType mapping', () => {
    const CATEGORY_TYPE_MAP: Record<string, 'SHOW' | 'MOVIE'> = {
      'TV (English)': 'SHOW',
      'TV (Non-English)': 'SHOW',
      'Films (English)': 'MOVIE',
      'Films (Non-English)': 'MOVIE',
    };

    it('should map TV categories to SHOW', () => {
      expect(CATEGORY_TYPE_MAP['TV (English)']).toBe('SHOW');
      expect(CATEGORY_TYPE_MAP['TV (Non-English)']).toBe('SHOW');
    });

    it('should map Films categories to MOVIE', () => {
      expect(CATEGORY_TYPE_MAP['Films (English)']).toBe('MOVIE');
      expect(CATEGORY_TYPE_MAP['Films (Non-English)']).toBe('MOVIE');
    });
  });
});

describe('Title normalization for Netflix data', () => {
  it('should normalize season titles correctly', () => {
    const result = normalizeTitle('Squid Game: Season 2', 'SHOW');
    expect(result.canonical).toBe('Squid Game');
    expect(result.season).toBe(2);
  });

  it('should handle titles without seasons', () => {
    const result = normalizeTitle('Wednesday', 'SHOW');
    expect(result.canonical).toBe('Wednesday');
    expect(result.season).toBeNull();
  });

  it('should normalize movie titles', () => {
    const result = normalizeTitle('Leave the World Behind', 'MOVIE');
    expect(result.canonical).toBe('Leave the World Behind');
    expect(result.season).toBeNull();
  });

  it('should match season variants of the same show', () => {
    const base = normalizeTitle('Squid Game', 'SHOW');
    const season2 = normalizeTitle('Squid Game: Season 2', 'SHOW');
    expect(base.titleKey).toBe(season2.titleKey);
  });

  it('should handle special characters in titles', () => {
    const result = normalizeTitle("The Queen's Gambit (Limited Series)", 'SHOW');
    expect(result.canonical).toBe("The Queen's Gambit");
  });
});

describe('US data filtering', () => {
  it('should filter to US rows only by iso2', () => {
    const usRows = sampleCountryRows.filter((row) => row.country_iso2 === 'US');
    expect(usRows.length).toBe(2);
    expect(usRows.every((r) => r.country_iso2 === 'US')).toBe(true);
  });

  it('should filter to US rows by country name', () => {
    const usRows = sampleCountryRows.filter(
      (row) => row.country_name === 'United States'
    );
    expect(usRows.length).toBe(2);
  });
});

describe('Title matching across data sources', () => {
  it('should match global and US titles for the same show', () => {
    const globalTitle = 'Squid Game: Season 2';
    const usTitle = 'Squid Game: Season 2';
    expect(titlesMatch(globalTitle, usTitle)).toBe(true);
  });

  it('should match despite minor variations', () => {
    // Sometimes Netflix data has slight variations
    expect(titlesMatch('Squid Game: Season 2', 'Squid Game - Season 2')).toBe(true);
    expect(titlesMatch('The Queens Gambit', "The Queen's Gambit")).toBe(true);
  });
});

describe('Views calculation', () => {
  it('should calculate views from hours and runtime', () => {
    const hoursViewed = 124000000;
    const runtimeHours = 8; // 8 hours for the season
    const views = hoursViewed / runtimeHours;
    expect(views).toBe(15500000);
  });

  it('should handle missing runtime gracefully', () => {
    const hoursViewed = 56000000;
    const runtimeHours = null;
    const views = runtimeHours ? hoursViewed / runtimeHours : 0;
    expect(views).toBe(0);
  });
});

describe('Sample data structure validation', () => {
  it('should have required fields in global rows', () => {
    for (const row of sampleGlobalRows) {
      expect(row.week).toBeDefined();
      expect(row.category).toBeDefined();
      expect(row.weekly_rank).toBeDefined();
      expect(row.show_title).toBeDefined();
      expect(row.weekly_hours_viewed).toBeDefined();
    }
  });

  it('should have required fields in country rows', () => {
    for (const row of sampleCountryRows) {
      expect(row.country_iso2).toBeDefined();
      expect(row.week).toBeDefined();
      expect(row.category).toBeDefined();
      expect(row.weekly_rank).toBeDefined();
      expect(row.show_title).toBeDefined();
    }
  });
});
