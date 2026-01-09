import axios from 'axios';
import * as XLSX from 'xlsx';

const NETFLIX_GLOBAL_URL = 'https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx';
const NETFLIX_COUNTRIES_URL = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.xlsx';

async function checkCategories() {
  // Check global data categories
  console.log('Downloading global data...');
  const globalResp = await axios.get(NETFLIX_GLOBAL_URL, { responseType: 'arraybuffer' });
  const globalWb = XLSX.read(globalResp.data, { type: 'buffer' });
  const globalSheet = globalWb.Sheets[globalWb.SheetNames[0]];
  const globalData = XLSX.utils.sheet_to_json(globalSheet) as any[];

  const globalCategories = [...new Set(globalData.map(r => r.category))];
  console.log('\n=== Global Categories ===');
  globalCategories.forEach(c => console.log(`  - "${c}"`));

  // Find His & Hers in global
  const hisHers = globalData.filter(r =>
    (r.show_title?.includes('His') && r.show_title?.includes('Hers')) ||
    (r.season_title?.includes('His') && r.season_title?.includes('Hers'))
  );
  console.log('\n=== His & Hers in Global Data ===');
  if (hisHers.length > 0) {
    hisHers.slice(0, 5).forEach(r => {
      console.log(`  Week: ${r.week}, Rank: ${r.weekly_rank}, Category: ${r.category}`);
      console.log(`    Title: ${r.show_title} / ${r.season_title}`);
    });
  } else {
    console.log('  Not found in global data');
  }

  // Check countries data categories
  console.log('\nDownloading countries data (first 1000 rows for speed)...');
  const countriesResp = await axios.get(NETFLIX_COUNTRIES_URL, { responseType: 'arraybuffer' });
  const countriesWb = XLSX.read(countriesResp.data, { type: 'buffer' });
  const countriesSheet = countriesWb.Sheets[countriesWb.SheetNames[0]];
  const countriesData = XLSX.utils.sheet_to_json(countriesSheet) as any[];

  // Get recent US data
  const usData = countriesData.filter(r => r.country_iso2 === 'US' || r.country_name === 'United States');
  const usCategories = [...new Set(usData.map(r => r.category))];
  console.log('\n=== US Categories ===');
  usCategories.forEach(c => console.log(`  - "${c}"`));

  // Check most recent US week
  const recentUS = usData.slice(-20);
  console.log('\n=== Recent US Data Sample ===');
  recentUS.slice(0, 10).forEach(r => {
    console.log(`  ${r.category}: #${r.weekly_rank} ${r.show_title}`);
  });
}

checkCategories().catch(console.error);
