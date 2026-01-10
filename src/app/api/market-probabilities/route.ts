/**
 * Market Probabilities API
 *
 * Returns probability distribution for Polymarket Netflix markets.
 * Probabilities sum to 100% across all outcomes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateMarketProbabilities, MarketCategory } from '@/lib/forecaster';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES: MarketCategory[] = [
  'shows-us',
  'shows-global',
  'films-us',
  'films-global',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') as MarketCategory | null;

    // Validate category
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const probabilities = await generateMarketProbabilities(category);

    return NextResponse.json({
      success: true,
      data: probabilities,
    });
  } catch (error) {
    console.error('Error generating market probabilities:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
