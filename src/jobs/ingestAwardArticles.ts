/**
 * Award Articles Ingestion Job
 *
 * Fetches Golden Globes prediction articles from major entertainment sources
 * and uses AI to extract structured predictions mapped to categories.
 */

import prisma from '@/lib/prisma';
import { analyzeArticle, ArticleAnalysis, CategoryPrediction } from '@/lib/articleAnalyzer';

/**
 * Known prediction article sources for Golden Globes 2026
 */
const ARTICLE_SOURCES: Array<{
  source: string;
  title: string;
  url: string;
}> = [
  {
    source: 'Variety',
    title: 'Golden Globes Predictions 2026: Winners That Could Make History',
    url: 'https://variety.com/2026/film/awards/golden-globes-predictions-winners-2026-history-upsets-1236625141/',
  },
  {
    source: 'Variety',
    title: '2026 Golden Globes Predictions in Every Category',
    url: 'https://variety.com/lists/2026-golden-globes-predictions/',
  },
  {
    source: 'Variety',
    title: 'Golden Globes 2026 Analysis: Oscar Season Contenders Gaining Momentum',
    url: 'https://variety.com/2025/film/awards/golden-globes-2026-oscars-analysis-international-breakdown-1236603434/',
  },
  {
    source: 'Awards Daily',
    title: 'Predict the 2026 Golden Globe Winners',
    url: 'https://www.awardsdaily.com/2025/12/16/contest-alert-2026-predict-the-golden-globe-winners-open-for-business/',
  },
  {
    source: 'Gold Derby',
    title: 'Golden Globes 2026 Predictions: Best Scores by Experts',
    url: 'https://www.goldderby.com/film/2025/golden-globes-2026-nominations-best-prediction-scores/',
  },
  {
    source: 'Award Expert',
    title: '2026 Golden Globes Predictions in All Categories',
    url: 'https://awardexpert.media/golden-globes',
  },
  {
    source: 'StyleRave',
    title: 'Golden Globes 2026 Predictions: Sinners Leads The Pack',
    url: 'https://www.stylerave.com/golden-globes-2026-predictions/',
  },
];

export interface ArticleIngestionResult {
  articlesProcessed: number;
  articlesAdded: number;
  predictionsExtracted: number;
  errors: string[];
}

/**
 * Fetch article content from URL
 */
async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.log(`  Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract main article content (simple extraction)
    // Remove script and style tags
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

    // Try to find article content
    const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    }

    // Remove remaining HTML tags
    content = content.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    content = content
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    // Truncate to reasonable length for API
    return content.slice(0, 15000);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Map category name from article analysis to database category
 */
function mapCategoryToDb(analysisCategory: string, dbCategories: Array<{ id: string; name: string; slug: string }>): { id: string; name: string } | null {
  // Normalize the category name for matching
  const normalizedAnalysis = analysisCategory.toLowerCase()
    .replace(/[–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const dbCat of dbCategories) {
    const normalizedDb = dbCat.name.toLowerCase()
      .replace(/[–-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Check for exact or partial match
    if (normalizedDb === normalizedAnalysis ||
        normalizedDb.includes(normalizedAnalysis) ||
        normalizedAnalysis.includes(normalizedDb)) {
      return { id: dbCat.id, name: dbCat.name };
    }

    // Special case mappings
    if (normalizedAnalysis.includes('best director') && normalizedDb.includes('best director')) {
      return { id: dbCat.id, name: dbCat.name };
    }
    if (normalizedAnalysis.includes('screenplay') && normalizedDb.includes('screenplay')) {
      return { id: dbCat.id, name: dbCat.name };
    }
    if (normalizedAnalysis.includes('animated') && normalizedDb.includes('animated')) {
      return { id: dbCat.id, name: dbCat.name };
    }
    if (normalizedAnalysis.includes('drama') && normalizedDb.includes('drama')) {
      if (normalizedAnalysis.includes('actor') && normalizedDb.includes('actor')) {
        return { id: dbCat.id, name: dbCat.name };
      }
      if (normalizedAnalysis.includes('actress') && normalizedDb.includes('actress')) {
        return { id: dbCat.id, name: dbCat.name };
      }
      if (normalizedAnalysis.includes('picture') && normalizedDb.includes('picture')) {
        return { id: dbCat.id, name: dbCat.name };
      }
    }
    if ((normalizedAnalysis.includes('comedy') || normalizedAnalysis.includes('musical')) &&
        (normalizedDb.includes('comedy') || normalizedDb.includes('musical'))) {
      if (normalizedAnalysis.includes('actor') && normalizedDb.includes('actor')) {
        return { id: dbCat.id, name: dbCat.name };
      }
      if (normalizedAnalysis.includes('actress') && normalizedDb.includes('actress')) {
        return { id: dbCat.id, name: dbCat.name };
      }
      if (normalizedAnalysis.includes('picture') && normalizedDb.includes('picture')) {
        return { id: dbCat.id, name: dbCat.name };
      }
    }
  }

  return null;
}

/**
 * Main ingestion function
 */
export async function ingestAwardArticles(): Promise<ArticleIngestionResult> {
  const result: ArticleIngestionResult = {
    articlesProcessed: 0,
    articlesAdded: 0,
    predictionsExtracted: 0,
    errors: [],
  };

  console.log('\n📰 Starting Award Articles Ingestion\n');

  // Get the Golden Globes 2026 show
  const show = await prisma.awardShow.findFirst({
    where: { slug: 'golden-globes-2026' },
    include: {
      categories: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  if (!show) {
    result.errors.push('Golden Globes 2026 show not found');
    return result;
  }

  console.log(`Found show: ${show.name} with ${show.categories.length} categories\n`);

  // Process each article source
  for (const articleInfo of ARTICLE_SOURCES) {
    result.articlesProcessed++;
    console.log(`\n📄 Processing: ${articleInfo.title}`);
    console.log(`   Source: ${articleInfo.source}`);
    console.log(`   URL: ${articleInfo.url}`);

    // Check if already processed
    const existing = await prisma.awardArticle.findUnique({
      where: { url: articleInfo.url },
    });

    if (existing) {
      console.log('   ⏭️ Already processed, skipping...');
      continue;
    }

    // Fetch article content
    const content = await fetchArticleContent(articleInfo.url);
    if (!content || content.length < 500) {
      console.log('   ⚠️ Failed to fetch or content too short');
      result.errors.push(`Failed to fetch: ${articleInfo.url}`);
      continue;
    }

    console.log(`   ✅ Fetched ${content.length} characters`);

    // Analyze with AI
    let analysis: ArticleAnalysis;
    try {
      console.log('   🤖 Analyzing with Claude...');
      analysis = await analyzeArticle(content, articleInfo.title, articleInfo.source);
      console.log(`   ✅ Extracted ${analysis.predictions.length} predictions`);

      for (const pred of analysis.predictions) {
        console.log(`      - ${pred.categoryName}: ${pred.predictedWinner} (${pred.confidence})`);
      }
    } catch (error) {
      console.error('   ❌ AI analysis failed:', error);
      result.errors.push(`AI analysis failed for: ${articleInfo.title}`);
      continue;
    }

    // Map predictions to categories and store
    const mappedPredictions: Array<{
      categoryId: string;
      categoryName: string;
      prediction: CategoryPrediction;
    }> = [];

    for (const pred of analysis.predictions) {
      const mappedCat = mapCategoryToDb(pred.categoryName, show.categories);
      if (mappedCat) {
        mappedPredictions.push({
          categoryId: mappedCat.id,
          categoryName: mappedCat.name,
          prediction: pred,
        });
        result.predictionsExtracted++;
      } else {
        console.log(`      ⚠️ Could not map category: ${pred.categoryName}`);
      }
    }

    // Create article in database (for show-wide)
    const article = await prisma.awardArticle.create({
      data: {
        showId: show.id,
        source: articleInfo.source,
        title: articleInfo.title,
        url: articleInfo.url,
        summary: analysis.summary,
        predictions: {
          predictions: mappedPredictions.map(mp => ({
            categoryId: mp.categoryId,
            categoryName: mp.categoryName,
            predictedWinner: mp.prediction.predictedWinner,
            predictedFilm: mp.prediction.predictedFilm,
            confidence: mp.prediction.confidence,
            reasoning: mp.prediction.reasoning,
            quote: mp.prediction.quote,
            alternates: mp.prediction.alternates,
          })),
          keyInsights: analysis.keyInsights,
          overallSentiment: analysis.overallSentiment,
        },
        publishedAt: new Date(), // Could extract from article if available
      },
    });

    console.log(`   💾 Saved article ID: ${article.id}`);
    result.articlesAdded++;

    // Also create per-category article entries for easier querying
    for (const mp of mappedPredictions) {
      await prisma.awardArticle.upsert({
        where: {
          url: `${articleInfo.url}#${mp.categoryId}`,
        },
        update: {
          predictions: {
            predictedWinner: mp.prediction.predictedWinner,
            predictedFilm: mp.prediction.predictedFilm,
            confidence: mp.prediction.confidence,
            reasoning: mp.prediction.reasoning,
            quote: mp.prediction.quote,
            alternates: mp.prediction.alternates,
          },
        },
        create: {
          showId: show.id,
          categoryId: mp.categoryId,
          source: articleInfo.source,
          title: articleInfo.title,
          url: `${articleInfo.url}#${mp.categoryId}`,
          summary: mp.prediction.reasoning,
          predictions: {
            predictedWinner: mp.prediction.predictedWinner,
            predictedFilm: mp.prediction.predictedFilm,
            confidence: mp.prediction.confidence,
            reasoning: mp.prediction.reasoning,
            quote: mp.prediction.quote,
            alternates: mp.prediction.alternates,
          },
          publishedAt: new Date(),
        },
      });
    }

    // Rate limiting between articles
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return result;
}

// Allow running directly
if (require.main === module) {
  ingestAwardArticles()
    .then(result => {
      console.log('\n📊 Ingestion Complete!\n');
      console.log(`  Articles processed: ${result.articlesProcessed}`);
      console.log(`  Articles added: ${result.articlesAdded}`);
      console.log(`  Predictions extracted: ${result.predictionsExtracted}`);
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
