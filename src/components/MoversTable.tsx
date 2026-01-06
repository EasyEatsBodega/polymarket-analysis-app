"use client";

import { MomentumBreakdownInline, MomentumBreakdownData } from "./MomentumBreakdown";

import { useState, useEffect } from "react";

interface Mover {
  id: string;
  title: string;
  type: "SHOW" | "MOVIE";
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  views: number | null;
  momentumScore: number;
  momentumBreakdown: MomentumBreakdownData | null;
  forecastP10: number | null;
  forecastP50: number | null;
  forecastP90: number | null;
}

interface MoversTableProps {
  type?: "SHOW" | "MOVIE";
  geo?: "GLOBAL" | "US";
  language?: "english" | "non-english";
  limit?: number;
}

type SortColumn = "rank" | "change" | "views" | "momentum";
type SortOrder = "asc" | "desc";

function formatViews(views: number | null): string {
  if (views === null) return "-";
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(0)}K`;
  }
  return views.toString();
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) {
    return (
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (order === "asc") {
    return (
      <svg className="w-4 h-4 text-old-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-old-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SortableHeader({
  label,
  column,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string;
  column: SortColumn;
  currentSort: SortColumn;
  currentOrder: SortOrder;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = currentSort === column;
  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon active={isActive} order={currentOrder} />
      </div>
    </th>
  );
}

function RankChange({ change }: { change: number | null }) {
  if (change === null) return <span className="text-gray-400">-</span>;
  if (change > 0) {
    return (
      <span className="text-green-600 font-medium flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        {change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="text-red-600 font-medium flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        {Math.abs(change)}
      </span>
    );
  }
  return <span className="text-gray-500">-</span>;
}

function MomentumBadge({ score, breakdown }: { score: number; breakdown: MomentumBreakdownData | null }) {
  // If we have breakdown data, use the inline component
  if (breakdown) {
    return <MomentumBreakdownInline breakdown={breakdown} />;
  }

  // Fallback to simple badge
  let colorClass = "bg-gray-100 text-gray-700";
  if (score >= 70) colorClass = "bg-green-100 text-green-800";
  else if (score >= 50) colorClass = "bg-yellow-100 text-yellow-800";
  else if (score < 40) colorClass = "bg-red-100 text-red-800";

  return (
    <span className={`px-2 py-1 rounded-full text-sm font-medium ${colorClass}`}>
      {score}
    </span>
  );
}

function ForecastBand({ p10, p50, p90 }: { p10: number | null; p50: number | null; p90: number | null }) {
  if (p10 === null || p50 === null || p90 === null) {
    return <span className="text-gray-400 text-sm">No forecast</span>;
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-500">{p10}</span>
      <span className="text-gunmetal font-medium">→ {p50} ←</span>
      <span className="text-gray-500">{p90}</span>
    </div>
  );
}

export default function MoversTable({ type, geo = "GLOBAL", language, limit = 10 }: MoversTableProps) {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortColumn>("rank");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      // Toggle order if same column
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // New column - set default order based on column type
      setSortBy(column);
      // Rank should default to asc (1 first), others default to desc (highest first)
      setSortOrder(column === "rank" ? "asc" : "desc");
    }
  };

  useEffect(() => {
    async function fetchMovers() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        params.set("geo", geo);
        if (language) params.set("language", language);
        params.set("sort", sortBy);
        params.set("order", sortOrder);
        params.set("limit", limit.toString());

        const response = await fetch(`/api/movers?${params}`);
        const data = await response.json();

        if (data.success) {
          setMovers(data.data);
        } else {
          setError(data.error || "Failed to fetch movers");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchMovers();
  }, [type, geo, language, sortBy, sortOrder, limit]);

  if (loading) {
    return (
      <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-gray-200 rounded mb-2"></div>
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

  if (movers.length === 0) {
    return (
      <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
        <p className="text-gray-500">No movers data available yet.</p>
        <p className="text-sm text-gray-400 mt-2">
          Run the Netflix ingestion job to populate data.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-dust-grey">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader
              label="Rank"
              column="rank"
              currentSort={sortBy}
              currentOrder={sortOrder}
              onSort={handleSort}
            />
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Title
            </th>
            <SortableHeader
              label="Change"
              column="change"
              currentSort={sortBy}
              currentOrder={sortOrder}
              onSort={handleSort}
            />
            {geo === "GLOBAL" && (
              <SortableHeader
                label="Views"
                column="views"
                currentSort={sortBy}
                currentOrder={sortOrder}
                onSort={handleSort}
              />
            )}
            <SortableHeader
              label="Momentum"
              column="momentum"
              currentSort={sortBy}
              currentOrder={sortOrder}
              onSort={handleSort}
            />
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Forecast (10-50-90)
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-dust-grey">
          {movers.map((mover) => (
            <tr key={mover.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-2xl font-bold text-gunmetal">
                  #{mover.currentRank || "-"}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gunmetal">{mover.title}</div>
                <div className="text-xs text-gray-500">{mover.type}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <RankChange change={mover.rankChange} />
              </td>
              {geo === "GLOBAL" && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {formatViews(mover.views)}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap">
                <MomentumBadge score={mover.momentumScore} breakdown={mover.momentumBreakdown} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <ForecastBand
                  p10={mover.forecastP10}
                  p50={mover.forecastP50}
                  p90={mover.forecastP90}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
