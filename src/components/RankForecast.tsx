"use client";

import React from "react";

interface RankForecastProps {
  currentRank: number | null;
  forecastP50: number | null;
  forecastP10?: number | null;
  forecastP90?: number | null;
  showRange?: boolean;
}

function getRankColor(rank: number | null): string {
  if (rank === null) return "text-gray-400";
  if (rank === 1) return "text-old-gold";
  if (rank <= 3) return "text-green-600";
  if (rank <= 5) return "text-blue-600";
  return "text-gray-600";
}

function getDirectionIcon(current: number | null, forecast: number | null): React.ReactNode {
  if (current === null || forecast === null) return null;

  if (forecast < current) {
    // Climbing (lower rank number = better)
    return (
      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    );
  } else if (forecast > current) {
    // Falling
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    );
  } else {
    // Staying same
    return (
      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    );
  }
}

function getChangeLabel(current: number | null, forecast: number | null): string {
  if (current === null || forecast === null) return "";
  if (forecast < current) return `climb ${current - forecast}`;
  if (forecast > current) return `drop ${forecast - current}`;
  return "stay";
}

export default function RankForecast({
  currentRank,
  forecastP50,
  forecastP10,
  forecastP90,
  showRange = true,
}: RankForecastProps) {
  const hasData = currentRank !== null || forecastP50 !== null;

  if (!hasData) {
    return (
      <div className="text-center py-2">
        <span className="text-gray-400 text-sm">No rank data</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Main rank display */}
      <div className="flex items-center justify-center gap-3">
        {/* Current rank */}
        <div className="text-center">
          <span className={`text-3xl font-bold ${getRankColor(currentRank)}`}>
            #{currentRank ?? "?"}
          </span>
          <div className="text-xs text-gray-500 uppercase">Now</div>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center">
          {getDirectionIcon(currentRank, forecastP50)}
          <span className="text-xs text-gray-500">
            {getChangeLabel(currentRank, forecastP50)}
          </span>
        </div>

        {/* Forecast rank */}
        <div className="text-center">
          <span className={`text-3xl font-bold ${getRankColor(forecastP50)}`}>
            #{forecastP50 ?? "?"}
          </span>
          <div className="text-xs text-gray-500 uppercase">Predicted</div>
        </div>
      </div>

      {/* Confidence range */}
      {showRange && forecastP10 !== null && forecastP90 !== null && (
        <div className="text-center">
          <span className="text-xs text-gray-500">
            range: #{forecastP10} - #{forecastP90}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for smaller displays
 */
export function RankForecastInline({
  currentRank,
  forecastP50,
}: {
  currentRank: number | null;
  forecastP50: number | null;
}) {
  if (currentRank === null && forecastP50 === null) {
    return <span className="text-gray-400">-</span>;
  }

  const isClimbing = forecastP50 !== null && currentRank !== null && forecastP50 < currentRank;
  const isFalling = forecastP50 !== null && currentRank !== null && forecastP50 > currentRank;

  return (
    <span className="inline-flex items-center gap-1">
      <span className={getRankColor(currentRank)}>#{currentRank ?? "?"}</span>
      <span className="text-gray-400">→</span>
      <span className={`${getRankColor(forecastP50)} ${isClimbing ? "font-bold" : ""}`}>
        #{forecastP50 ?? "?"}
      </span>
      {isClimbing && <span className="text-green-500 text-xs">↑</span>}
      {isFalling && <span className="text-red-500 text-xs">↓</span>}
    </span>
  );
}
