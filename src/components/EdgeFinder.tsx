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
  marketProbability: number;
  modelProbability: number;
  edge: number;
  edgePercent: number;
  signalStrength: 'strong' | 'moderate' | 'weak';
  direction: 'BUY' | 'AVOID';
  momentumScore: number;
  accelerationScore: number;
  forecastP50: number | null;
  confidence: 'low' | 'medium' | 'high';
  priceChange24h: number | null;
}

interface EdgeFinderResponse {
  success: boolean;
  data: EdgeOpportunity[];
  meta: {
    totalEdges: number;
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

function EdgeBar({ marketProb, modelProb }: { marketProb: number; modelProb: number }) {
  const isPositive = modelProb > marketProb;
  const maxProb = Math.max(marketProb, modelProb, 0.5);

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
  const isPositive = edge.edge > 0;

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
          <h4 className="font-semibold text-gunmetal truncate">{edge.outcomeName}</h4>
          <span className="text-xs text-gray-500">{edge.marketLabel}</span>
        </div>
        <SignalBadge direction={edge.direction} strength={edge.signalStrength} />
      </div>

      {/* Edge Visualization */}
      <div className="mb-4">
        <EdgeBar marketProb={edge.marketProbability} modelProb={edge.modelProbability} />
      </div>

      {/* Edge Display */}
      <div className={`text-center p-3 rounded-lg mb-3 ${
        isPositive
          ? 'bg-green-50 border border-green-200'
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="text-xs text-gray-600 mb-0.5">
          {isPositive ? 'UNDERPRICED' : 'OVERPRICED'}
        </div>
        <div className={`text-2xl font-bold ${
          isPositive ? 'text-green-600' : 'text-red-600'
        }`}>
          {isPositive ? '+' : ''}{edge.edgePercent.toFixed(1)}%
        </div>
      </div>

      {/* Supporting Metrics */}
      <div className="grid grid-cols-3 gap-2 text-xs border-t border-dust-grey pt-3">
        <div className="text-center">
          <span className="block text-gray-400">Momentum</span>
          <span className="font-semibold text-gunmetal">{edge.momentumScore}</span>
        </div>
        <div className="text-center">
          <span className="block text-gray-400">Forecast</span>
          <span className="font-semibold text-gunmetal">
            #{edge.forecastP50 ?? '-'}
          </span>
        </div>
        <div className="text-center">
          <span className="block text-gray-400">Confidence</span>
          <span className={`font-semibold capitalize ${
            edge.confidence === 'high' ? 'text-green-600' :
            edge.confidence === 'medium' ? 'text-yellow-600' : 'text-gray-400'
          }`}>
            {edge.confidence}
          </span>
        </div>
      </div>

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
      <p className="text-gray-500">No significant edge opportunities found.</p>
      <p className="text-sm text-gray-400 mt-1">
        Edges are flagged when our model disagrees with market odds by 10%+.
      </p>
    </div>
  );
}

interface EdgeFinderProps {
  category?: string;
  minEdge?: number;
  limit?: number;
}

export default function EdgeFinder({ category, minEdge = 10, limit = 12 }: EdgeFinderProps) {
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
          <span className="font-semibold text-gunmetal">{meta.totalEdges}</span> opportunities with {minEdge}%+ edge
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600 font-medium">
            {meta.buySignals} BUY
          </span>
          <span className="text-red-600 font-medium">
            {meta.avoidSignals} AVOID
          </span>
          <span className="text-gray-500">
            Avg: {meta.avgEdge}%
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
