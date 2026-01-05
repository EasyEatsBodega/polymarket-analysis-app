"use client";

import { useState, useEffect } from "react";

interface Breakout {
  id: string;
  title: string;
  type: "SHOW" | "MOVIE";
  momentumScore: number;
  accelerationScore: number;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  weeksOnChart: number;
  historicalPattern: string;
}

interface BreakoutCardProps {
  breakout: Breakout;
}

function PatternBadge({ pattern }: { pattern: string }) {
  const patternLabels: Record<string, { label: string; color: string }> = {
    climbing_fast: { label: "Rising Fast", color: "bg-green-500" },
    climbing_slow: { label: "Rising", color: "bg-green-400" },
    stable: { label: "Stable", color: "bg-gray-400" },
    falling_slow: { label: "Declining", color: "bg-orange-400" },
    falling_fast: { label: "Falling Fast", color: "bg-red-500" },
  };

  const { label, color } = patternLabels[pattern] || { label: pattern, color: "bg-gray-400" };

  return (
    <span className={`px-2 py-1 rounded-full text-xs text-white ${color}`}>
      {label}
    </span>
  );
}

function AccelerationIndicator({ score }: { score: number }) {
  const width = Math.min(Math.abs(score), 100);
  const isPositive = score > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${isPositive ? "bg-green-500" : "bg-red-500"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`text-sm font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
        {isPositive ? "+" : ""}{score}
      </span>
    </div>
  );
}

function BreakoutCardComponent({ breakout }: BreakoutCardProps) {
  return (
    <div className="border border-dust-grey rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-medium text-gunmetal">{breakout.title}</h3>
          <span className="text-xs text-gray-500">{breakout.type}</span>
        </div>
        <PatternBadge pattern={breakout.historicalPattern} />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Rank</span>
          <span className="font-bold text-gunmetal">
            #{breakout.currentRank || "-"}
            {breakout.rankChange !== null && breakout.rankChange > 0 && (
              <span className="text-green-600 text-sm ml-1">(+{breakout.rankChange})</span>
            )}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Momentum</span>
          <span className="font-bold text-old-gold">{breakout.momentumScore}</span>
        </div>

        <div>
          <span className="text-sm text-gray-600 block mb-1">Acceleration</span>
          <AccelerationIndicator score={breakout.accelerationScore} />
        </div>

        <div className="pt-2 border-t border-dust-grey">
          <span className="text-xs text-gray-500">
            {breakout.weeksOnChart} week{breakout.weeksOnChart !== 1 ? "s" : ""} on chart
          </span>
        </div>
      </div>
    </div>
  );
}

interface BreakoutGridProps {
  type?: "SHOW" | "MOVIE";
  limit?: number;
}

export default function BreakoutGrid({ type, limit = 6 }: BreakoutGridProps) {
  const [breakouts, setBreakouts] = useState<Breakout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBreakouts() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        params.set("limit", limit.toString());

        const response = await fetch(`/api/breakouts?${params}`);
        const data = await response.json();

        if (data.success) {
          setBreakouts(data.data);
        } else {
          setError(data.error || "Failed to fetch breakouts");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchBreakouts();
  }, [type, limit]);

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

  if (breakouts.length === 0) {
    return (
      <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
        <p className="text-gray-500">No breakout titles detected.</p>
        <p className="text-sm text-gray-400 mt-2">
          Titles appear here when momentum exceeds threshold with positive acceleration.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {breakouts.map((breakout) => (
        <BreakoutCardComponent key={breakout.id} breakout={breakout} />
      ))}
    </div>
  );
}

export { BreakoutCardComponent };
