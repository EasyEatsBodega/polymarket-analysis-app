"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Title {
  id: string;
  name: string;
  type: string;
  color: string;
  currentRank: number | null;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  [key: string]: string | number | null;
}

interface FlixPatrolRankChartProps {
  type: "SHOW" | "MOVIE";
  region: "us" | "world";
  days?: number;
  titleId?: string; // Single title mode for detail page
  polymarketOnly?: boolean;
}

export default function FlixPatrolRankChart({
  type,
  region,
  days = 14,
  titleId,
  polymarketOnly = false,
}: FlixPatrolRankChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchChartData() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          type,
          region,
          days: days.toString(),
        });

        if (titleId) {
          params.set("titleId", titleId);
        }
        if (polymarketOnly) {
          params.set("polymarketOnly", "true");
        }

        const response = await fetch(`/api/charts/flixpatrol-trends?${params}`);
        const data = await response.json();

        if (data.success) {
          setChartData(data.data.chartData);
          setTitles(data.data.titles);
          // Select all titles by default
          setSelectedTitles(new Set(data.data.titles.map((t: Title) => t.id)));
        } else {
          setError(data.error || "Failed to fetch chart data");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchChartData();
  }, [type, region, days, titleId, polymarketOnly]);

  const toggleTitle = (tid: string) => {
    setSelectedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) {
        next.delete(tid);
      } else {
        next.add(tid);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-gunmetal rounded-lg p-8 animate-pulse">
        <div className="h-[400px] bg-gray-700 rounded"></div>
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

  if (chartData.length === 0) {
    return (
      <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
        <p className="text-gray-500">No FlixPatrol data available yet.</p>
      </div>
    );
  }

  // Custom tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gunmetal text-white p-3 rounded-lg shadow-lg border border-gray-600">
          <p className="font-semibold mb-2">{label}</p>
          {payload
            .filter((p) => p.value !== null)
            .sort((a, b) => a.value - b.value)
            .map((p) => {
              const title = titles.find((t) => t.id === p.dataKey);
              return (
                <div
                  key={p.dataKey}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span style={{ color: p.color }}>{title?.name}</span>
                  <span className="font-mono">#{p.value}</span>
                </div>
              );
            })}
        </div>
      );
    }
    return null;
  };

  // Single title mode - simpler display
  const isSingleTitle = !!titleId || titles.length === 1;

  return (
    <div className="bg-gunmetal rounded-lg p-6">
      {/* Title Legend / Toggle - only show if multiple titles */}
      {!isSingleTitle && (
        <div className="flex flex-wrap gap-2 mb-6">
          {titles.map((title) => {
            // Check if this is a linked title (has real titleId) or unlinked (uses slug key)
            const isLinked = !title.id.startsWith("slug:");
            return (
              <div key={title.id} className="flex items-center">
                <button
                  onClick={() => toggleTitle(title.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all border ${
                    isLinked ? "rounded-l-lg border-r-0" : "rounded-lg"
                  } ${
                    selectedTitles.has(title.id)
                      ? "bg-white border-white text-gunmetal"
                      : "bg-transparent border-gray-600 text-gray-500 opacity-50"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: title.color }}
                  />
                  <span
                    className={`max-w-[180px] truncate ${
                      selectedTitles.has(title.id)
                        ? "text-gray-900"
                        : "text-gray-400"
                    }`}
                  >
                    {title.name}
                  </span>
                  {title.currentRank && (
                    <span
                      className={`text-xs ${
                        selectedTitles.has(title.id)
                          ? "text-gray-600"
                          : "text-gray-500"
                      }`}
                    >
                      #{title.currentRank}
                    </span>
                  )}
                </button>
                {isLinked && (
                  <Link
                    href={`/netflix/${title.id}`}
                    className={`px-2 py-2 rounded-r-lg border transition-all ${
                      selectedTitles.has(title.id)
                        ? "bg-pine-blue border-pine-blue text-white hover:bg-opacity-80"
                        : "bg-transparent border-gray-600 text-gray-500 hover:text-white hover:border-gray-400"
                    }`}
                    title={`View ${title.name} details`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div className={isSingleTitle ? "h-[250px]" : "h-[400px]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="dateLabel"
              stroke="#9CA3AF"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              tickLine={{ stroke: "#4B5563" }}
            />
            <YAxis
              reversed
              domain={[1, 10]}
              ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
              stroke="#9CA3AF"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              tickLine={{ stroke: "#4B5563" }}
              label={{
                value: "Rank",
                angle: -90,
                position: "insideLeft",
                fill: "#9CA3AF",
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Reference lines for top 3 */}
            <ReferenceLine
              y={1}
              stroke="#FFD700"
              strokeDasharray="5 5"
              strokeOpacity={0.3}
            />
            <ReferenceLine
              y={3}
              stroke="#C0C0C0"
              strokeDasharray="5 5"
              strokeOpacity={0.2}
            />

            {titles
              .filter((title) => selectedTitles.has(title.id))
              .map((title) => (
                <Line
                  key={title.id}
                  type="monotone"
                  dataKey={title.id}
                  name={title.name}
                  stroke={title.color}
                  strokeWidth={isSingleTitle ? 3 : 2}
                  dot={{ r: isSingleTitle ? 5 : 4, fill: title.color }}
                  activeDot={{ r: isSingleTitle ? 7 : 6, fill: title.color }}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Legend */}
      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-px bg-yellow-500 opacity-50"
            style={{ borderTop: "2px dashed" }}
          />
          <span>#1 Position</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-px bg-gray-400 opacity-30"
            style={{ borderTop: "2px dashed" }}
          />
          <span>Top 3</span>
        </div>
      </div>
    </div>
  );
}
