"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface RankData {
  week: string;
  rank: number;
  views: number | null;
  category: string;
}

interface SignalData {
  date: string;
  value: number;
}

interface MarketData {
  id: string;
  slug: string;
  question: string;
  outcomes: string[];
  endDate: string | null;
  resolved: boolean;
  latestPrices: number[] | null;
}

interface ForecastData {
  weekStart: string;
  weekEnd: string;
  target: string;
  p10: number;
  p50: number;
  p90: number;
  momentumScore?: number;
  confidence?: string;
}

interface TitleData {
  id: string;
  canonicalName: string;
  type: "SHOW" | "MOVIE";
  tmdbId: string | null;
  aliases: string[];
  rankings: {
    global: RankData[];
    us: RankData[];
  };
  signals: {
    trends: SignalData[];
    wikipedia: SignalData[];
  };
  forecasts: ForecastData[];
  markets: MarketData[];
}

function SignalChart({
  data,
  title,
  color,
  unit = ""
}: {
  data: SignalData[];
  title: string;
  color: string;
  unit?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
        <p className="text-gray-400 text-sm italic">No data available</p>
      </div>
    );
  }

  // Sort by date ascending for chart
  const sorted = [...data].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const maxValue = Math.max(...sorted.map(d => d.value));
  const minValue = Math.min(...sorted.map(d => d.value));
  const range = maxValue - minValue || 1;

  // Get latest value and trend
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const trend = previous ? ((latest.value - previous.value) / (previous.value || 1)) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-gunmetal">
            {latest.value.toLocaleString()}{unit}
          </p>
          {trend !== 0 && (
            <p className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Simple bar chart */}
      <div className="flex items-end gap-1 h-24">
        {sorted.slice(-14).map((d, i) => {
          const height = ((d.value - minValue) / range) * 100;
          const isLatest = i === sorted.slice(-14).length - 1;
          return (
            <div
              key={`${d.date}-${i}`}
              className="flex-1 group relative"
              title={`${new Date(d.date).toLocaleDateString()}: ${d.value.toLocaleString()}`}
            >
              <div
                className={`w-full rounded-t transition-all ${isLatest ? color : 'bg-gray-300'} hover:opacity-80`}
                style={{ height: `${Math.max(height, 5)}%` }}
              />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gunmetal text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {d.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{new Date(sorted[Math.max(0, sorted.length - 14)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(sorted[sorted.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}

function RankChart({ data, title }: { data: RankData[]; title: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
        <p className="text-gray-400 text-sm italic">No ranking data</p>
      </div>
    );
  }

  // Sort by week ascending
  const sorted = [...data].sort((a, b) =>
    new Date(a.week).getTime() - new Date(b.week).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const rankChange = previous ? previous.rank - latest.rank : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-gunmetal">#{latest.rank}</p>
          {rankChange !== 0 && (
            <p className={`text-sm font-medium ${rankChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rankChange > 0 ? '↑' : '↓'} {Math.abs(rankChange)} spots
            </p>
          )}
        </div>
      </div>

      {/* Rank history - inverted (lower is better) */}
      <div className="flex items-end gap-1 h-24">
        {sorted.slice(-8).map((d, i) => {
          // Invert: rank 1 = 100%, rank 10 = 10%
          const height = ((11 - d.rank) / 10) * 100;
          const isLatest = i === sorted.slice(-8).length - 1;
          return (
            <div
              key={`${d.week}-${i}`}
              className="flex-1 group relative"
            >
              <div
                className={`w-full rounded-t transition-all ${isLatest ? 'bg-pine-blue' : 'bg-gray-300'} hover:opacity-80`}
                style={{ height: `${Math.max(height, 10)}%` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gunmetal text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Week {new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: #{d.rank}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>8 weeks ago</span>
        <span>This week</span>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: MarketData }) {
  const yesPrice = market.latestPrices?.[0];
  const noPrice = market.latestPrices?.[1];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gunmetal mb-2 line-clamp-2">{market.question}</h3>

      {market.resolved ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm">
          Resolved
        </span>
      ) : (
        <>
          {yesPrice !== undefined && (
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Yes</span>
                  <span className="font-semibold text-green-600">{(yesPrice * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${yesPrice * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <a
            href={`https://polymarket.com/event/${market.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Trade on Polymarket →
          </a>
        </>
      )}

      {market.endDate && (
        <p className="text-xs text-gray-400 mt-2">
          Ends: {new Date(market.endDate).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastData }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-sm text-gray-500">
            Week of {new Date(forecast.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-xs text-gray-400">{forecast.target}</p>
        </div>
        {forecast.confidence && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            forecast.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
            forecast.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {forecast.confidence}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-400">P10</p>
          <p className="font-medium text-gray-600">#{forecast.p10}</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-gray-400">Expected</p>
          <p className="text-2xl font-bold text-gunmetal">#{forecast.p50}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">P90</p>
          <p className="font-medium text-gray-600">#{forecast.p90}</p>
        </div>
      </div>

      {forecast.momentumScore !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Momentum</span>
            <span className={`font-medium ${forecast.momentumScore > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {forecast.momentumScore > 0 ? '+' : ''}{forecast.momentumScore.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TitleDetailPage() {
  const params = useParams();
  const titleId = params.titleId as string;

  const [title, setTitle] = useState<TitleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/titles/${titleId}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error || "Failed to load data");
          return;
        }

        setTitle(json.data);
      } catch (err) {
        setError("Failed to load title data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [titleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pine-blue"></div>
        </div>
      </div>
    );
  }

  if (error || !title) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-red-500 mb-4">{error || "Title not found"}</p>
          <Link href="/netflix" className="text-pine-blue hover:underline">
            ← Back to Netflix
          </Link>
        </div>
      </div>
    );
  }

  // Get the primary category from latest ranking
  const latestRanking = title.rankings.global[0];
  const categoryLabel = latestRanking?.category || (title.type === 'SHOW' ? 'TV Series' : 'Film');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Hero Header */}
      <div className="bg-gunmetal text-white">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/netflix"
            className="inline-flex items-center gap-2 text-dust-grey hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Netflix
          </Link>
          <h1 className="text-3xl font-bold mb-2">{title.canonicalName}</h1>
          <div className="flex items-center gap-4 text-sm text-dust-grey">
            <span className={`px-2 py-1 rounded ${title.type === 'SHOW' ? 'bg-red-600' : 'bg-blue-600'} text-white`}>
              {title.type === 'SHOW' ? 'TV Series' : 'Film'}
            </span>
            <span>{categoryLabel}</span>
            {latestRanking && (
              <>
                <span>•</span>
                <span className="text-old-gold font-medium">
                  Currently #{latestRanking.rank} Global
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Rankings Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Netflix Rankings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RankChart data={title.rankings.global} title="Global Top 10" />
            <RankChart data={title.rankings.us} title="US Top 10" />
          </div>
        </section>

        {/* Signals Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Interest Signals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignalChart
              data={title.signals.trends}
              title="Google Trends"
              color="bg-blue-500"
            />
            <SignalChart
              data={title.signals.wikipedia}
              title="Wikipedia Pageviews"
              color="bg-orange-500"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Daily interest signals help track momentum. Rising signals may indicate growing popularity.
          </p>
        </section>

        {/* Polymarket Markets */}
        {title.markets.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Polymarket Markets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {title.markets.map(market => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </section>
        )}

        {/* Forecasts */}
        {title.forecasts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Rank Forecasts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {title.forecasts.map((forecast, i) => (
                <ForecastCard key={i} forecast={forecast} />
              ))}
            </div>
          </section>
        )}

        {/* Aliases */}
        {title.aliases && title.aliases.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-gray-500 mb-2">Also known as</h2>
            <div className="flex flex-wrap gap-2">
              {title.aliases.map((alias, i) => (
                <span key={i} className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {alias}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
