/**
 * Import Google Trends CSV Data
 *
 * Imports historical Google Trends data from CSV files exported from trends.google.com
 *
 * How to export from Google Trends:
 * 1. Go to https://trends.google.com/trends/explore
 * 2. Enter the title name (e.g., "Stranger Things")
 * 3. Set time range to "Past 90 days" (for daily data)
 * 4. Set location to "United States" for US data, or "Worldwide" for global
 * 5. Click the download button (↓) in the "Interest over time" section
 * 6. Save the CSV file
 *
 * File naming convention:
 *   {title-slug}_us.csv     - US data
 *   {title-slug}_global.csv - Worldwide data
 *
 * Usage:
 *   npx tsx scripts/import-google-trends-csv.ts ./trends-data/
 *   npx tsx scripts/import-google-trends-csv.ts ./trends-data/stranger-things_us.csv
 */

import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';
import { GeoRegion, SignalSource } from '@prisma/client';

interface TrendsDataPoint {
  date: Date;
  value: number;
}

/**
 * Parse Google Trends CSV file
 * Google Trends CSV format:
 *   Line 1-2: Headers (Category, etc.)
 *   Line 3: Empty or column headers
 *   Line 4+: Data rows (Day, Value)
 */
function parseTrendsCSV(content: string): TrendsDataPoint[] {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  const dataPoints: TrendsDataPoint[] = [];

  // Find the data start - look for the header row with "Day" or date-like values
  let dataStartIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header lines until we find data
    if (line.match(/^\d{4}-\d{2}-\d{2}/) || line.startsWith('Day,')) {
      dataStartIndex = line.startsWith('Day,') ? i + 1 : i;
      break;
    }
  }

  // Parse data rows
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',');

    if (parts.length >= 2) {
      const dateStr = parts[0].trim();
      const valueStr = parts[1].trim();

      // Parse date (YYYY-MM-DD format)
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateMatch) {
        const date = new Date(
          parseInt(dateMatch[1]),
          parseInt(dateMatch[2]) - 1,
          parseInt(dateMatch[3])
        );
        date.setHours(0, 0, 0, 0);

        // Parse value (number or "<1" which means ~0)
        let value = 0;
        if (valueStr === '<1') {
          value = 0.5; // Treat "<1" as 0.5
        } else {
          const parsed = parseInt(valueStr);
          if (!isNaN(parsed)) {
            value = parsed;
          }
        }

        dataPoints.push({ date, value });
      }
    }
  }

  return dataPoints;
}

/**
 * Extract title name and geo from filename
 * Expected format: {title-slug}_us.csv or {title-slug}_global.csv
 */
function parseFilename(filename: string): { titleSlug: string; geo: GeoRegion } | null {
  const basename = path.basename(filename, '.csv');

  if (basename.endsWith('_us')) {
    return {
      titleSlug: basename.replace(/_us$/, ''),
      geo: 'US' as GeoRegion,
    };
  } else if (basename.endsWith('_global') || basename.endsWith('_worldwide')) {
    return {
      titleSlug: basename.replace(/_(global|worldwide)$/, ''),
      geo: 'GLOBAL' as GeoRegion,
    };
  }

  // Default to global if no suffix
  return {
    titleSlug: basename,
    geo: 'GLOBAL' as GeoRegion,
  };
}

/**
 * Convert slug to title name for matching
 */
function slugToTitleName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Find title in database by name (fuzzy match)
 */
async function findTitle(titleSlug: string): Promise<{ id: string; canonicalName: string } | null> {
  const titleName = slugToTitleName(titleSlug);

  // Try exact match first
  let title = await prisma.title.findFirst({
    where: { canonicalName: { equals: titleName, mode: 'insensitive' } },
    select: { id: true, canonicalName: true },
  });

  if (title) return title;

  // Try contains match
  title = await prisma.title.findFirst({
    where: { canonicalName: { contains: titleName, mode: 'insensitive' } },
    select: { id: true, canonicalName: true },
  });

  if (title) return title;

  // Try searching without common suffixes
  const baseName = titleName.replace(/\s*\d+$/, '').trim();
  if (baseName !== titleName) {
    title = await prisma.title.findFirst({
      where: { canonicalName: { startsWith: baseName, mode: 'insensitive' } },
      select: { id: true, canonicalName: true },
    });
  }

  return title;
}

/**
 * Import a single CSV file
 */
async function importCSVFile(filePath: string): Promise<{ imported: number; skipped: number; title: string | null }> {
  const filename = path.basename(filePath);
  console.log(`\nProcessing: ${filename}`);

  // Parse filename
  const parsed = parseFilename(filename);
  if (!parsed) {
    console.log(`  ⚠️  Could not parse filename format. Expected: {title-slug}_us.csv or {title-slug}_global.csv`);
    return { imported: 0, skipped: 0, title: null };
  }

  console.log(`  Title slug: "${parsed.titleSlug}", Geo: ${parsed.geo}`);

  // Find title in database
  const title = await findTitle(parsed.titleSlug);
  if (!title) {
    console.log(`  ⚠️  Title not found in database for slug: "${parsed.titleSlug}"`);
    return { imported: 0, skipped: 0, title: null };
  }

  console.log(`  Matched to: "${title.canonicalName}"`);

  // Read and parse CSV
  const content = fs.readFileSync(filePath, 'utf-8');
  const dataPoints = parseTrendsCSV(content);

  if (dataPoints.length === 0) {
    console.log(`  ⚠️  No data points found in CSV`);
    return { imported: 0, skipped: 0, title: title.canonicalName };
  }

  console.log(`  Found ${dataPoints.length} data points`);

  // Import data points
  let imported = 0;
  let skipped = 0;

  for (const point of dataPoints) {
    try {
      await prisma.dailySignal.upsert({
        where: {
          titleId_date_source_geo: {
            titleId: title.id,
            date: point.date,
            source: 'TRENDS' as SignalSource,
            geo: parsed.geo,
          },
        },
        create: {
          titleId: title.id,
          date: point.date,
          source: 'TRENDS' as SignalSource,
          geo: parsed.geo,
          value: point.value,
        },
        update: {
          value: point.value,
        },
      });
      imported++;
    } catch (error) {
      skipped++;
    }
  }

  console.log(`  ✓ Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped, title: title.canonicalName };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/import-google-trends-csv.ts <path>

Examples:
  npx tsx scripts/import-google-trends-csv.ts ./trends-data/
  npx tsx scripts/import-google-trends-csv.ts ./trends-data/stranger-things_us.csv

File naming convention:
  {title-slug}_us.csv     - US data (e.g., stranger-things_us.csv)
  {title-slug}_global.csv - Worldwide data (e.g., stranger-things_global.csv)

How to export from Google Trends:
  1. Go to https://trends.google.com/trends/explore
  2. Enter the title name (e.g., "Stranger Things")
  3. Set time range to "Past 90 days" (for daily data)
  4. Set location to "United States" for US, "Worldwide" for global
  5. Click the download button (↓) in "Interest over time"
  6. Rename the file to match the convention above
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const stats = fs.statSync(inputPath);

  let files: string[] = [];

  if (stats.isDirectory()) {
    // Get all CSV files in directory
    files = fs.readdirSync(inputPath)
      .filter(f => f.endsWith('.csv'))
      .map(f => path.join(inputPath, f));
  } else if (stats.isFile() && inputPath.endsWith('.csv')) {
    files = [inputPath];
  } else {
    console.error('Error: Path must be a CSV file or directory containing CSV files');
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No CSV files found.');
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('Google Trends CSV Import');
  console.log('='.repeat(60));
  console.log(`Found ${files.length} CSV file(s) to process`);

  let totalImported = 0;
  let totalSkipped = 0;
  const results: { file: string; title: string | null; imported: number }[] = [];

  for (const file of files) {
    const result = await importCSVFile(file);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    results.push({ file: path.basename(file), title: result.title, imported: result.imported });
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${files.length}`);
  console.log(`Total imported: ${totalImported}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log('\nResults:');
  for (const r of results) {
    const status = r.title ? `✓ ${r.title} (${r.imported} points)` : '✗ Not found';
    console.log(`  ${r.file}: ${status}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
