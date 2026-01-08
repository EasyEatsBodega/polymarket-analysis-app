"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface WatchlistItem {
  id: string;
  titleId: string;
  pinnedAt: string;
  pinnedBy: string | null;
  title: {
    id: string;
    name: string;
    type: "SHOW" | "MOVIE";
  };
  releaseDate: string | null;
  pacing: {
    current: number | null;
    trendsUS: number | null;
    trendsGlobal: number | null;
    wikiViews: number | null;
    trendPercent: number | null;
    sparkline: { date: string; score: number | null }[];
  };
}

interface WatchlistPanelProps {
  limit?: number;
  onUnpin?: (titleId: string) => void;
}

function PacingBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-500">
        No data
      </span>
    );
  }

  let color = "bg-gray-400";
  let label = "Low";

  if (score >= 70) {
    color = "bg-green-500";
    label = "Hot";
  } else if (score >= 50) {
    color = "bg-yellow-500";
    label = "Warm";
  } else if (score >= 30) {
    color = "bg-orange-400";
    label = "Building";
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs text-white ${color}`}>
      {label} ({score.toFixed(0)})
    </span>
  );
}

function TrendIndicator({ percent }: { percent: number | null }) {
  if (percent === null) return null;

  const isPositive = percent > 0;
  const icon = isPositive ? "↑" : percent < 0 ? "↓" : "→";
  const color = isPositive
    ? "text-green-600"
    : percent < 0
    ? "text-red-600"
    : "text-gray-500";

  return (
    <span className={`text-sm font-medium ${color}`}>
      {icon} {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

function MiniSparkline({ data }: { data: { date: string; score: number | null }[] }) {
  if (!data || data.length === 0) {
    return <div className="w-16 h-6 bg-gray-100 rounded" />;
  }

  const scores = data.map((d) => d.score).filter((s): s is number => s !== null);
  if (scores.length === 0) {
    return <div className="w-16 h-6 bg-gray-100 rounded" />;
  }

  const max = Math.max(...scores, 1);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * 60;
      const y = d.score !== null ? 24 - ((d.score - min) / range) * 20 : 22;
      return `${x},${y}`;
    })
    .join(" ");

  const isUpward = scores.length >= 2 && scores[scores.length - 1] > scores[0];

  return (
    <svg width="64" height="28" className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={isUpward ? "#22c55e" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DaysUntilRelease({ releaseDate }: { releaseDate: string | null }) {
  if (!releaseDate) return null;

  const release = new Date(releaseDate);
  const today = new Date();
  const diffTime = release.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return <span className="text-xs text-gray-500">Released</span>;
  }

  if (diffDays === 0) {
    return <span className="text-xs text-green-600 font-medium">Today!</span>;
  }

  return (
    <span className="text-xs text-gray-500">
      {diffDays} day{diffDays !== 1 ? "s" : ""} away
    </span>
  );
}

function WatchlistCard({
  item,
  onUnpin,
}: {
  item: WatchlistItem;
  onUnpin?: (titleId: string) => void;
}) {
  const [unpinning, setUnpinning] = useState(false);

  const handleUnpin = async () => {
    setUnpinning(true);
    try {
      const response = await fetch(`/api/watchlist/${item.titleId}`, {
        method: "DELETE",
      });
      if (response.ok && onUnpin) {
        onUnpin(item.titleId);
      }
    } catch (error) {
      console.error("Failed to unpin:", error);
    } finally {
      setUnpinning(false);
    }
  };

  return (
    <div className="border border-dust-grey rounded-lg p-4 bg-white hover:shadow-md hover:border-pine-blue transition-all">
      <div className="flex justify-between items-start mb-3">
        <Link href={`/netflix/${item.title.id}`} className="flex-1 min-w-0 group">
          <h3 className="font-medium text-gunmetal truncate group-hover:text-pine-blue transition-colors">{item.title.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{item.title.type}</span>
            <DaysUntilRelease releaseDate={item.releaseDate} />
          </div>
        </Link>
        <button
          onClick={handleUnpin}
          disabled={unpinning}
          className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove from watchlist"
        >
          {unpinning ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
        </button>
      </div>

      <Link href={`/netflix/${item.title.id}`} className="block">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Pacing</span>
          <PacingBadge score={item.pacing.current} />
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">7-day Trend</span>
          <div className="flex items-center gap-2">
            <MiniSparkline data={item.pacing.sparkline} />
            <TrendIndicator percent={item.pacing.trendPercent} />
          </div>
        </div>

        {(item.pacing.trendsUS !== null || item.pacing.wikiViews !== null) && (
          <div className="pt-2 border-t border-dust-grey grid grid-cols-2 gap-2 text-xs">
            {item.pacing.trendsUS !== null && (
              <div>
                <span className="text-gray-500">Trends US:</span>
                <span className="ml-1 font-medium">{item.pacing.trendsUS.toFixed(0)}</span>
              </div>
            )}
            {item.pacing.wikiViews !== null && (
              <div>
                <span className="text-gray-500">Wiki:</span>
                <span className="ml-1 font-medium">
                  {item.pacing.wikiViews >= 1000
                    ? `${(item.pacing.wikiViews / 1000).toFixed(1)}K`
                    : item.pacing.wikiViews.toFixed(0)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      </Link>
    </div>
  );
}

export default function WatchlistPanel({ limit = 10, onUnpin }: WatchlistPanelProps) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());

      const response = await fetch(`/api/watchlist?${params}`);
      const data = await response.json();

      if (data.success) {
        setWatchlist(data.data);
      } else {
        setError(data.error || "Failed to fetch watchlist");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, [limit]);

  const handleUnpin = (titleId: string) => {
    setWatchlist((prev) => prev.filter((item) => item.titleId !== titleId));
    if (onUnpin) {
      onUnpin(titleId);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-dust-grey rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded"></div>
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

  if (watchlist.length === 0) {
    return (
      <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
        <p className="text-gray-500">No titles in your watchlist.</p>
        <p className="text-sm text-gray-400 mt-2">
          Pin upcoming Netflix releases to track their pacing signals before they hit the Top 10.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {watchlist.map((item) => (
        <WatchlistCard key={item.id} item={item} onUnpin={handleUnpin} />
      ))}
    </div>
  );
}

export { WatchlistCard };
