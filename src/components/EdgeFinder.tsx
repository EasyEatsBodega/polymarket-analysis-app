"use client";

import { useState, useEffect } from "react";

interface EdgeOpportunity {
  marketSlug: string;
  marketLabel: string;
  polymarketUrl: string;
  category: string;
  outcomeName: string;
  titleId: string | null;
  titleName: string | null;
  signalType: 'model_edge' | 'market_momentum';
  marketProbability: number;
  modelProbability: number;
  edge: number;
  edgePercent: number;
  signalStrength: 'strong' | 'moderate' | 'weak';
  direction: 'BUY' | 'AVOID';
  momentumScore: number;
  accelerationScore: number;
  forecastP50: number | null;
  forecastP10: number | null;
  forecastP90: number | null;
  confidence: 'low' | 'medium' | 'high';
  historicalPattern: string;
  reasoning: string;
  priceChange24h: number | null;
  priceChange7d: number | null;
  volume24h: number | null;
}

interface EdgeFinderResponse {
  success: boolean;
  data: EdgeOpportunity[];
  meta: {
    totalEdges: number;
    modelEdges: number;
    momentumSignals: number;
    strongSignals: number;
    moderateSignals: number;
    buySignals: number;
    avoidSignals: number;
    avgEdge: number;
    fetchedAt: string;
  };
  error?: string;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function SignalTypeBadge({ signalType }: { signalType: 'model_edge' | 'market_momentum' }) {
  if (signalType === 'model_edge') {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
        MODEL
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
      TREND
    </span>
  );
}

function SignalBadge({ direction, strength }: { direction: 'BUY' | 'AVOID'; strength: string }) {
  const baseClasses = "px-2 py-0.5 rounded-full text-xs font-bold uppercase";

  if (direction === 'BUY') {
    return (
      <span className={`${baseClasses} bg-green-100 text-green-700 border border-green-200`}>
        {strength === 'strong' ? 'Strong Buy' : 'Buy'}
      </span>
    );
  }

  return (
    <span className={`${baseClasses} bg-red-100 text-red-700 border border-red-200`}>
      {strength === 'strong' ? 'Strong Avoid' : 'Avoid'}
    </span>
  );
}

function EdgeBar({ marketProb, modelProb, signalType }: { marketProb: number; modelProb: number; signalType: 'model_edge' | 'market_momentum' }) {
  const isPositive = modelProb > marketProb;
  const maxProb = Math.max(marketProb, modelProb, 0.5);

  if (signalType === 'market_momentum') {
    // For momentum signals, just show the current market probability
    return (
      <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-pine-blue bg-opacity-30 rounded-full"
          style={{ width: `${(marketProb / maxProb) * 100}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
          <span className="text-pine-blue">Market: {formatPercent(marketProb)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
      {/* Market probability bar */}
      <div
        className="absolute top-0 left-0 h-full bg-pine-blue bg-opacity-30 rounded-full"
        style={{ width: `${(marketProb / maxProb) * 100}%` }}
      />
      {/* Model probability indicator */}
      <div
        className={`absolute top-0 h-full w-0.5 ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
        style={{ left: `${(modelProb / maxProb) * 100}%` }}
      />
      {/* Labels */}
      <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-medium">
        <span className="text-pine-blue">Market {formatPercent(marketProb)}</span>
        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
          Model {formatPercent(modelProb)}
        </span>
      </div>
    </div>
  );
}

function EdgeCard({ edge }: { edge: EdgeOpportunity }) {
  const isPositive = edge.direction === 'BUY';
  const isModelEdge = edge.signalType === 'model_edge';

  // Format forecast range (only for model_edge)
  const forecastRange = edge.forecastP10 !== null && edge.forecastP90 !== null
    ? `#${edge.forecastP10}-${edge.forecastP90}`
    : edge.forecastP50 !== null
      ? `#${edge.forecastP50}`
      : '-';

  // Format price changes (for momentum signals)
  const formatPriceChange = (change: number | null) => {
    if (change === null) return '-';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  return (
    <a
      href={edge.polymarketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-dust-grey rounded-lg p-4 bg-white hover:border-pine-blue hover:shadow-md transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SignalTypeBadge signalType={edge.signalType} />
          </div>
          <h4 className="font-semibold text-gunmetal truncate">{edge.outcomeName}</h4>
          <span className="text-xs text-gray-500">{edge.marketLabel}</span>
        </div>
        <SignalBadge direction={edge.direction} strength={edge.signalStrength} />
      </div>

      {/* Edge Visualization */}
      <div className="mb-3">
        <EdgeBar
          marketProb={edge.marketProbability}
          modelProb={edge.modelProbability}
          signalType={edge.signalType}
        />
      </div>

      {/* Reasoning */}
      <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
        <span className="font-medium text-gunmetal">Why: </span>
        {edge.reasoning}
      </div>

      {/* Edge/Momentum Display */}
      <div className={`text-center p-3 rounded-lg mb-3 ${
        isPositive
          ? 'bg-green-50 border border-green-200'
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="text-xs text-gray-600 mb-0.5">
          {isModelEdge
            ? (isPositive ? 'UNDERPRICED' : 'OVERPRICED')
            : (isPositive ? 'TRENDING UP' : 'TRENDING DOWN')
          }
        </div>
        <div className={`text-2xl font-bold ${
          isPositive ? 'text-green-600' : 'text-red-600'
        }`}>
          {isPositive ? '+' : ''}{edge.edgePercent.toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {isModelEdge ? 'model edge' : 'price momentum'}
        </div>
      </div>

      {/* Supporting Metrics - Different for each signal type */}
      {isModelEdge ? (
        <div className="grid grid-cols-3 gap-2 text-xs border-t border-dust-grey pt-3">
          <div className="text-center">
            <span className="block text-gray-400">Forecast</span>
            <span className="font-semibold text-gunmetal">{forecastRange}</span>
          </div>
          <div className="text-center">
            <span className="block text-gray-400">Momentum</span>
            <span className={`font-semibold ${
              edge.momentumScore >= 70 ? 'text-green-600' :
              edge.momentumScore >= 50 ? 'text-yellow-600' : 'text-red-500'
            }`}>{edge.momentumScore}</span>
          </div>
          <div className="text-center">
            <span className="block text-gray-400">Trend</span>
            <span className={`font-semibold ${
              edge.accelerationScore > 0 ? 'text-green-600' :
              edge.accelerationScore < 0 ? 'text-red-500' : 'text-gray-500'
            }`}>
              {edge.accelerationScore > 0 ? '↑' : edge.accelerationScore < 0 ? '↓' : '→'}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-xs border-t border-dust-grey pt-3">
          <div className="text-center">
            <span className="block text-gray-400">24h</span>
            <span className={`font-semibold ${
              (edge.priceChange24h ?? 0) > 0 ? 'text-green-600' :
              (edge.priceChange24h ?? 0) < 0 ? 'text-red-500' : 'text-gray-500'
            }`}>{formatPriceChange(edge.priceChange24h)}</span>
          </div>
          <div className="text-center">
            <span className="block text-gray-400">7d</span>
            <span className={`font-semibold ${
              (edge.priceChange7d ?? 0) > 0 ? 'text-green-600' :
              (edge.priceChange7d ?? 0) < 0 ? 'text-red-500' : 'text-gray-500'
            }`}>{formatPriceChange(edge.priceChange7d)}</span>
          </div>
          <div className="text-center">
            <span className="block text-gray-400">Volume</span>
            <span className="font-semibold text-gunmetal">
              {edge.volume24h ? `$${(edge.volume24h / 1000).toFixed(0)}k` : '-'}
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-dust-grey flex items-center justify-between">
        <span className="text-xs text-gray-400">Click to trade on Polymarket</span>
        <span className="text-xs text-pine-blue font-medium group-hover:underline">
          Trade →
        </span>
      </div>
    </a>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-dust-grey rounded-lg p-4 bg-white animate-pulse">
          <div className="flex justify-between mb-3">
            <div className="h-5 bg-gray-200 rounded w-1/2"></div>
            <div className="h-5 bg-gray-200 rounded w-16"></div>
          </div>
          <div className="h-6 bg-gray-100 rounded-full mb-4"></div>
          <div className="h-16 bg-gray-100 rounded-lg mb-3"></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-8 bg-gray-100 rounded"></div>
            <div className="h-8 bg-gray-100 rounded"></div>
            <div className="h-8 bg-gray-100 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gray-50 rounded-lg p-6 text-center border border-dust-grey">
      <p className="text-gray-500">No trading signals available.</p>
      <p className="text-sm text-gray-400 mt-1">
        Check back soon - signals are generated from price trends and model forecasts.
      </p>
    </div>
  );
}

interface EdgeFinderProps {
  category?: string;
  minEdge?: number;
  limit?: number;
}

export default function EdgeFinder({ category, minEdge = 5, limit = 12 }: EdgeFinderProps) {
  const [response, setResponse] = useState<EdgeFinderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEdges() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        params.set('minEdge', minEdge.toString());
        params.set('limit', limit.toString());

        const res = await fetch(`/api/edge-finder?${params}`);
        const data: EdgeFinderResponse = await res.json();

        if (data.success) {
          setResponse(data);
        } else {
          throw new Error(data.error || 'Failed to fetch edges');
        }
      } catch (err) {
        console.error('Error fetching edges:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch edges');
        setResponse(null);
      } finally {
        setLoading(false);
      }
    }

    fetchEdges();
  }, [category, minEdge, limit]);

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Failed to load edge analysis</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!response || response.data.length === 0) {
    return <EmptyState />;
  }

  const { data: edges, meta } = response;

  return (
    <div>
      {/* Summary Header */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-dust-grey flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gunmetal">{meta.totalEdges}</span> signals
          {meta.modelEdges > 0 && (
            <span className="ml-2 text-purple-600">({meta.modelEdges} model)</span>
          )}
          {meta.momentumSignals > 0 && (
            <span className="ml-2 text-blue-600">({meta.momentumSignals} trend)</span>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600 font-medium">
            {meta.buySignals} BUY
          </span>
          <span className="text-red-600 font-medium">
            {meta.avoidSignals} AVOID
          </span>
        </div>
      </div>

      {/* Edge Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {edges.map((edge, idx) => (
          <EdgeCard key={`${edge.marketSlug}-${edge.outcomeName}-${idx}`} edge={edge} />
        ))}
      </div>
    </div>
  );
}
