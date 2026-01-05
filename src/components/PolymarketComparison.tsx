"use client";

import { useState, useEffect } from "react";

interface Market {
  id: string;
  conditionId: string;
  question: string;
  outcomes: Array<{ id: string; name: string; price?: number }>;
  latestPrices: Record<string, number> | null;
  volume: number | null;
  liquidity: number | null;
  lastUpdated: string | null;
  linkedTitles: Array<{ id: string; name: string }>;
}

interface Forecast {
  titleId: string;
  titleName: string;
  p10: number;
  p50: number;
  p90: number;
  momentumScore: number | null;
}

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}%`;
}

function formatVolume(volume: number | null): string {
  if (volume === null) return "-";
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _DiscrepancyIndicator({ modelP50, marketPrice }: { modelP50: number; marketPrice: number }) {
  const discrepancy = marketPrice - modelP50;
  const absDiscrepancy = Math.abs(discrepancy);

  let bgColor = "bg-gray-100";
  let textColor = "text-gray-700";

  if (absDiscrepancy > 2) {
    bgColor = discrepancy > 0 ? "bg-red-100" : "bg-green-100";
    textColor = discrepancy > 0 ? "text-red-700" : "text-green-700";
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      {discrepancy > 0 ? "+" : ""}{discrepancy.toFixed(0)} ranks
    </span>
  );
}

function MarketCard({ market, forecasts }: { market: Market; forecasts: Forecast[] }) {
  const linkedForecast = market.linkedTitles.length > 0
    ? forecasts.find((f) => market.linkedTitles.some((t) => t.id === f.titleId))
    : null;

  return (
    <div className="border border-dust-grey rounded-lg p-4 bg-white">
      <h4 className="font-medium text-gunmetal mb-2 line-clamp-2">{market.question}</h4>

      <div className="space-y-3">
        {/* Market Prices */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Market Prices</div>
          <div className="flex flex-wrap gap-2">
            {market.outcomes.slice(0, 4).map((outcome, idx) => {
              const price = market.latestPrices?.[outcome.name] ?? outcome.price ?? 0;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-pine-blue bg-opacity-10 px-2 py-1 rounded"
                >
                  <span className="text-sm text-gray-600 truncate max-w-20">{outcome.name}</span>
                  <span className="text-sm font-medium text-pine-blue">{formatPrice(price)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Forecast Comparison */}
        {linkedForecast && (
          <div className="border-t border-dust-grey pt-3">
            <div className="text-xs text-gray-500 mb-1">Model Forecast</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{linkedForecast.titleName}</span>
                <span className="text-sm font-medium text-old-gold">
                  Rank {linkedForecast.p10}-{linkedForecast.p50}-{linkedForecast.p90}
                </span>
              </div>
              {linkedForecast.momentumScore && (
                <span className="text-xs text-gray-500">
                  Momentum: {linkedForecast.momentumScore}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Market Stats */}
        <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-dust-grey">
          <span>Volume: {formatVolume(market.volume)}</span>
          <span>Liquidity: {formatVolume(market.liquidity)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PolymarketComparison() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch markets and forecasts in parallel
        const [marketsRes, forecastsRes] = await Promise.all([
          fetch("/api/markets?active=true&withTitles=true&limit=10"),
          fetch("/api/forecasts?target=US_RANK&limit=50"),
        ]);

        const [marketsData, forecastsData] = await Promise.all([
          marketsRes.json(),
          forecastsRes.json(),
        ]);

        if (marketsData.success) {
          setMarkets(marketsData.data);
        } else {
          throw new Error(marketsData.error || "Failed to fetch markets");
        }

        if (forecastsData.success) {
          setForecasts(forecastsData.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border border-dust-grey rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="bg-pine-blue bg-opacity-10 rounded-lg p-8 text-center border border-pine-blue border-opacity-30">
        <p className="text-pine-blue font-medium">No Polymarket data available yet.</p>
        <p className="text-sm text-gray-500 mt-2">
          Run the Polymarket sync job to discover Netflix-related markets.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} forecasts={forecasts} />
      ))}
    </div>
  );
}
