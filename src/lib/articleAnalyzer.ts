/**
 * Article Analyzer
 *
 * Uses Claude API to analyze awards prediction articles and extract
 * structured predictions mapped to specific categories.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Extracted prediction for a specific category
 */
export interface CategoryPrediction {
  categoryName: string;           // "Best Director", "Best Picture - Drama"
  predictedWinner: string;        // "Paul Thomas Anderson"
  predictedFilm?: string;         // "One Battle After Another" (if applicable)
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;              // Key reasoning from the article
  quote?: string;                 // Direct quote supporting prediction
  alternates?: string[];          // Other contenders mentioned
}

/**
 * Full extraction result from an article
 */
export interface ArticleAnalysis {
  summary: string;                // 2-3 sentence summary
  predictions: CategoryPrediction[];
  overallSentiment: 'bullish' | 'neutral' | 'uncertain';
  keyInsights: string[];          // Notable observations
  articleFocus: string[];         // Which categories the article primarily discusses
}

/**
 * Categories we're tracking for Golden Globes
 */
const GOLDEN_GLOBE_CATEGORIES = [
  'Best Director',
  'Best Motion Picture - Drama',
  'Best Motion Picture - Musical or Comedy',
  'Best Actor - Drama',
  'Best Actress - Drama',
  'Best Actor - Musical or Comedy',
  'Best Actress - Musical or Comedy',
  'Best Motion Picture - Animated',
  'Best Screenplay - Motion Picture',
  'Best Original Score',
  'Best Original Song - Motion Picture',
  'Best Motion Picture - Non-English Language',
  'Cinematic and Box Office Achievement',
];

/**
 * Analyze an article and extract predictions using Claude
 */
export async function analyzeArticle(
  articleText: string,
  articleTitle: string,
  articleSource: string
): Promise<ArticleAnalysis> {
  const prompt = `You are an expert awards analyst. Analyze this Golden Globes prediction article and extract structured predictions.

IMPORTANT RULES:
1. Only extract predictions that are EXPLICITLY stated or strongly implied in the article
2. Map each prediction to the EXACT category it discusses - do NOT cross-contaminate predictions
3. If a prediction is for "Best Picture" without specifying Drama/Comedy, determine from context
4. Confidence levels:
   - HIGH: Author explicitly predicts this as the winner with certainty
   - MEDIUM: Author favors this as likely winner but notes competition
   - LOW: Author mentions as a possibility or dark horse
5. Include direct quotes when available
6. Note any alternate contenders the author discusses

CATEGORIES TO MAP TO:
${GOLDEN_GLOBE_CATEGORIES.map(c => `- ${c}`).join('\n')}

ARTICLE SOURCE: ${articleSource}
ARTICLE TITLE: ${articleTitle}

ARTICLE TEXT:
${articleText}

Respond with a JSON object (no markdown, just pure JSON) in this exact format:
{
  "summary": "2-3 sentence summary of the article's main points and predictions",
  "predictions": [
    {
      "categoryName": "exact category name from list above",
      "predictedWinner": "name of person or film predicted to win",
      "predictedFilm": "film name if the winner is a person",
      "confidence": "high|medium|low",
      "reasoning": "brief explanation of why this prediction was made",
      "quote": "direct quote from article if available",
      "alternates": ["other contenders mentioned"]
    }
  ],
  "overallSentiment": "bullish|neutral|uncertain",
  "keyInsights": ["notable observations from the article"],
  "articleFocus": ["list of categories the article primarily discusses"]
}

Only include predictions for categories that are actually discussed in the article.
If the article doesn't make clear predictions, return an empty predictions array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    // Parse JSON response (strip markdown code blocks if present)
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```')) {
      // Remove markdown code block wrapper
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const analysis = JSON.parse(jsonText) as ArticleAnalysis;

    // Validate and clean up predictions
    analysis.predictions = analysis.predictions
      .filter(p => {
        // Ensure category matches our known categories (fuzzy match)
        const matchedCategory = GOLDEN_GLOBE_CATEGORIES.find(
          c => c.toLowerCase().includes(p.categoryName.toLowerCase()) ||
               p.categoryName.toLowerCase().includes(c.toLowerCase().replace(' - ', ' '))
        );
        if (matchedCategory) {
          p.categoryName = matchedCategory; // Normalize to our category name
          return true;
        }
        return false;
      })
      .map(p => ({
        ...p,
        confidence: (['high', 'medium', 'low'].includes(p.confidence)
          ? p.confidence
          : 'medium') as 'high' | 'medium' | 'low',
      }));

    return analysis;
  } catch (error) {
    console.error('Error analyzing article:', error);
    throw error;
  }
}

/**
 * Analyze multiple articles and aggregate predictions
 */
export async function analyzeMultipleArticles(
  articles: Array<{ text: string; title: string; source: string; url: string }>
): Promise<Map<string, ArticleAnalysis & { url: string }>> {
  const results = new Map<string, ArticleAnalysis & { url: string }>();

  for (const article of articles) {
    try {
      const analysis = await analyzeArticle(article.text, article.title, article.source);
      results.set(article.url, { ...analysis, url: article.url });

      // Rate limiting - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to analyze article: ${article.title}`, error);
    }
  }

  return results;
}

/**
 * Get predictions for a specific category from analyzed articles
 */
export function getPredictionsForCategory(
  analyses: Map<string, ArticleAnalysis & { url: string }>,
  categoryName: string
): Array<CategoryPrediction & { source: string; url: string }> {
  const categoryPredictions: Array<CategoryPrediction & { source: string; url: string }> = [];

  for (const [url, analysis] of analyses) {
    const matchingPredictions = analysis.predictions.filter(
      p => p.categoryName.toLowerCase() === categoryName.toLowerCase()
    );

    for (const pred of matchingPredictions) {
      categoryPredictions.push({
        ...pred,
        source: analysis.articleFocus[0] || 'Unknown',
        url,
      });
    }
  }

  return categoryPredictions;
}

/**
 * Summarize article quickly without full prediction extraction
 * (cheaper, faster operation for initial display)
 */
export async function summarizeArticle(
  articleText: string,
  articleTitle: string
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Summarize this Golden Globes prediction article in 2-3 sentences, focusing on the main predictions made:

TITLE: ${articleTitle}

TEXT: ${articleText.slice(0, 5000)}

Provide only the summary, no other text.`,
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.type === 'text' ? textContent.text : 'Unable to generate summary';
  } catch (error) {
    console.error('Error summarizing article:', error);
    return 'Summary unavailable';
  }
}
