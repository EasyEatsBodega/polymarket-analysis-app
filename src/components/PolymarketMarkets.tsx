"use client";

import { useState, useEffect } from "react";

interface MarketOutcome {
  name: string;
  probability: number;
  volume: number;
}

interface MarketData {
  slug: string;
  label: string;
  question: string;
  outcomes: MarketOutcome[];
  totalVolume: number;
  polymarketUrl: string;
}

function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

function getProbabilityColor(prob: number): string {
  if (prob >= 0.7) return 'text-green-600 bg-green-50';
  if (prob >= 0.3) return 'text-yellow-600 bg-yellow-50';
  return 'text-gray-500 bg-gray-50';
}

function MarketCard({ market }: { market: MarketData }) {
  return (
    <a
      href={market.polymarketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-dust-grey rounded-lg p-4 bg-white hover:border-pine-blue hover:shadow-md transition-all group"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-pine-blue">{market.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Volume: {formatVolume(market.totalVolume)}</span>
          <svg
            className="w-4 h-4 text-gray-400 group-hover:text-pine-blue transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </div>

      {/* Outcomes List */}
      <div className="space-y-2">
        {market.outcomes.slice(0, 6).map((outcome, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm text-gunmetal font-medium truncate max-w-[60%]">
              {outcome.name}
            </span>
            <span className={`text-sm font-bold px-2 py-0.5 rounded ${getProbabilityColor(outcome.probability)}`}>
              {formatProbability(outcome.probability)}
            </span>
          </div>
        ))}
        {market.outcomes.length > 6 && (
          <p className="text-xs text-gray-400 text-center pt-1">
            +{market.outcomes.length - 6} more options
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-dust-grey flex items-center justify-between">
        <span className="text-xs text-gray-400">Click to view on Polymarket</span>
        <span className="text-xs text-pine-blue font-medium group-hover:underline">
          Trade →
        </span>
      </div>
    </a>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map((i) => (
        <div key={i} className="border border-dust-grey rounded-lg p-4 bg-white animate-pulse">
          <div className="flex justify-between mb-3">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/6"></div>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="flex justify-between py-1.5 px-2 bg-gray-50 rounded">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-12"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PolymarketMarketsProps {
  tab: string;
}

export default function PolymarketMarkets({ tab }: PolymarketMarketsProps) {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarkets() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/polymarket-netflix?tab=${tab}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch markets');
        }

        setMarkets(data.data || []);
      } catch (err) {
        console.error('Error fetching Polymarket markets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch markets');
        setMarkets([]);
      } finally {
        setLoading(false);
      }
    }

    fetchMarkets();
  }, [tab]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Failed to load markets</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center border border-dust-grey">
        <p className="text-gray-500">No active Polymarket markets for this category.</p>
        <p className="text-sm text-gray-400 mt-1">Markets update every Tuesday at 12pm EST.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {markets.map((market) => (
        <MarketCard key={market.slug} market={market} />
      ))}
    </div>
  );
}
