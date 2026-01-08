/**
 * Awards API
 *
 * Returns award shows with categories, nominees, and odds.
 * Supports filtering by show slug and includes edge calculations.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { OddsSource, Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Type for show with all relations included
type ShowWithRelations = Prisma.AwardShowGetPayload<{
  include: {
    categories: {
      include: {
        nominees: {
          include: {
            odds: true;
          };
        };
      };
    };
  };
}>;

interface NomineeWithEdge {
  id: string;
  name: string;
  subtitle: string | null;
  isWinner: boolean;
  odds: {
    source: OddsSource;
    probability: number;
    url: string | null;
  }[];
  polymarketOdds: number | null;
  maxEdge: number | null;  // Biggest difference from Polymarket
  edgeSource: OddsSource | null;
}

interface ArticlePrediction {
  predictedWinner: string;
  predictedFilm?: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  quote?: string;
  alternates?: string[];
}

interface ArticleResponse {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  predictions: ArticlePrediction | null;
}

interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  polymarketUrl: string | null;
  isClosed: boolean;
  leader: NomineeWithEdge | null;
  nominees: NomineeWithEdge[];
  articles: ArticleResponse[];
}

interface ShowResponse {
  id: string;
  name: string;
  slug: string;
  ceremonyDate: string;
  status: string;
  categories: CategoryResponse[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const showSlug = searchParams.get('show');

    // Build where clause
    const showWhere = showSlug ? { slug: showSlug } : {};

    // Fetch shows with all related data
    const shows = await prisma.awardShow.findMany({
      where: showWhere,
      include: {
        categories: {
          orderBy: { displayOrder: 'asc' },
          include: {
            nominees: {
              include: {
                odds: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { ceremonyDate: 'desc' },
    }) as unknown as ShowWithRelations[];

    // Fetch all articles for these shows
    const showIds = shows.map(s => s.id);
    const articles = await prisma.awardArticle.findMany({
      where: {
        showId: { in: showIds },
        categoryId: { not: null }, // Only get category-specific articles
      },
      orderBy: { publishedAt: 'desc' },
    });

    // Group articles by category ID
    const articlesByCategory = new Map<string, typeof articles>();
    for (const article of articles) {
      if (article.categoryId) {
        const existing = articlesByCategory.get(article.categoryId) || [];
        existing.push(article);
        articlesByCategory.set(article.categoryId, existing);
      }
    }

    // Transform data with edge calculations
    const response: ShowResponse[] = shows.map((show: ShowWithRelations) => ({
      id: show.id,
      name: show.name,
      slug: show.slug,
      ceremonyDate: show.ceremonyDate.toISOString(),
      status: show.status,
      categories: show.categories.map(category => {
        // Get articles for this category
        const categoryArticles = articlesByCategory.get(category.id) || [];
        // Transform nominees with edge calculations
        const nominees: NomineeWithEdge[] = category.nominees.map(nominee => {
          const polymarketOdds = nominee.odds.find(o => o.source === OddsSource.POLYMARKET);
          const otherOdds = nominee.odds.filter(o => o.source !== OddsSource.POLYMARKET);

          // Calculate max edge (difference from Polymarket)
          let maxEdge: number | null = null;
          let edgeSource: OddsSource | null = null;

          if (polymarketOdds) {
            for (const odds of otherOdds) {
              const edge = (odds.probability - polymarketOdds.probability) * 100;
              if (maxEdge === null || Math.abs(edge) > Math.abs(maxEdge)) {
                maxEdge = edge;
                edgeSource = odds.source;
              }
            }
          }

          return {
            id: nominee.id,
            name: nominee.name,
            subtitle: nominee.subtitle,
            isWinner: nominee.isWinner,
            odds: nominee.odds.map(o => ({
              source: o.source,
              probability: o.probability,
              url: o.url,
            })),
            polymarketOdds: polymarketOdds?.probability ?? null,
            maxEdge,
            edgeSource,
          };
        });

        // Sort nominees by Polymarket odds (highest first)
        nominees.sort((a, b) => (b.polymarketOdds ?? 0) - (a.polymarketOdds ?? 0));

        // Check if category is closed (any nominee has 100% odds = resolved)
        const isClosed = nominees.some(n => n.isWinner || (n.polymarketOdds !== null && n.polymarketOdds >= 0.99));

        // Get leader (highest odds or winner)
        const leader = nominees.find(n => n.isWinner) || nominees[0] || null;

        // Transform articles
        const articlesResponse: ArticleResponse[] = categoryArticles.map((article: (typeof articles)[number]) => {
          const predictions = article.predictions as Record<string, unknown> | null;
          return {
            id: article.id,
            source: article.source,
            title: article.title,
            url: article.url,
            summary: article.summary || '',
            publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
            predictions: predictions ? {
              predictedWinner: (predictions.predictedWinner as string) || '',
              predictedFilm: predictions.predictedFilm as string | undefined,
              confidence: (predictions.confidence as "high" | "medium" | "low") || 'medium',
              reasoning: (predictions.reasoning as string) || '',
              quote: predictions.quote as string | undefined,
              alternates: predictions.alternates as string[] | undefined,
            } : null,
          };
        });

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          polymarketUrl: category.polymarketUrl,
          isClosed,
          leader,
          nominees,
          articles: articlesResponse,
        };
      }),
    }));

    return NextResponse.json({
      success: true,
      data: showSlug ? response[0] : response,
      meta: {
        totalShows: response.length,
        totalCategories: response.reduce((sum, s) => sum + s.categories.length, 0),
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error in awards API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
