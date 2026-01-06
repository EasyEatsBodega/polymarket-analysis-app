"use client";

import { useState } from "react";

export interface MomentumBreakdownData {
  // Raw values
  trendsRaw: number | null;
  wikipediaRaw: number | null;
  rankDeltaRaw: number | null;

  // Normalized values (0-100 scale)
  trendsNormalized: number | null;
  wikipediaNormalized: number | null;
  rankDeltaNormalized: number | null;

  // Weights used
  weights: {
    trendsWeight: number;
    wikipediaWeight: number;
    rankDeltaWeight: number;
  };

  // Weighted contributions to final score
  trendsContribution: number;
  wikipediaContribution: number;
  rankDeltaContribution: number;

  // Final score
  totalScore: number;
}

interface MomentumBreakdownProps {
  breakdown: MomentumBreakdownData;
  showDetails?: boolean;
}

function formatNumber(num: number | null): string {
  if (num === null) return "-";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
}

function ComponentBar({
  label,
  icon,
  rawValue,
  rawUnit,
  normalizedValue,
  contribution,
  weight,
  color,
  maxContribution,
}: {
  label: string;
  icon: string;
  rawValue: number | null;
  rawUnit: string;
  normalizedValue: number | null;
  contribution: number;
  weight: number;
  color: string;
  maxContribution: number;
}) {
  const barWidth = maxContribution > 0 ? (contribution / maxContribution) * 100 : 0;
  const hasData = normalizedValue !== null;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-medium text-gunmetal">{label}</span>
          <span className="text-xs text-gray-400">({(weight * 100).toFixed(0)}%)</span>
        </div>
        <div className="flex items-center gap-2">
          {hasData ? (
            <>
              <span className="text-xs text-gray-500">
                {formatNumber(rawValue)} {rawUnit}
              </span>
              <span className="text-xs text-gray-400">→</span>
              <span className={`font-bold ${color}`}>{normalizedValue}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">No data</span>
          )}
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            hasData ? color.replace("text-", "bg-") : "bg-gray-200"
          }`}
          style={{ width: `${hasData ? barWidth : 0}%` }}
        />
      </div>
    </div>
  );
}

export default function MomentumBreakdown({ breakdown, showDetails = true }: MomentumBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  // Calculate max contribution for scaling bars
  const maxContribution = Math.max(
    breakdown.trendsContribution,
    breakdown.wikipediaContribution,
    breakdown.rankDeltaContribution,
    1 // Prevent division by zero
  );

  // Determine which components are active
  const activeComponents = [
    breakdown.trendsNormalized !== null,
    breakdown.wikipediaNormalized !== null,
    breakdown.rankDeltaNormalized !== null,
  ].filter(Boolean).length;

  // Score color
  const scoreColor =
    breakdown.totalScore >= 70
      ? "text-green-600"
      : breakdown.totalScore >= 50
      ? "text-old-gold"
      : breakdown.totalScore >= 30
      ? "text-orange-500"
      : "text-red-500";

  return (
    <div className="bg-white border border-dust-grey rounded-lg p-4">
      {/* Header with total score */}
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <div>
            <h4 className="font-medium text-gunmetal">Momentum Score</h4>
            <span className="text-xs text-gray-500">
              {activeComponents}/3 signals active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold ${scoreColor}`}>
            {breakdown.totalScore}
          </span>
          <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Compact bar preview */}
      {!expanded && (
        <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100">
          {breakdown.trendsNormalized !== null && (
            <div
              className="bg-blue-500 transition-all"
              style={{
                width: `${(breakdown.trendsContribution / (breakdown.trendsContribution + breakdown.wikipediaContribution + breakdown.rankDeltaContribution || 1)) * 100}%`,
              }}
              title={`Trends: ${breakdown.trendsNormalized}`}
            />
          )}
          {breakdown.wikipediaNormalized !== null && (
            <div
              className="bg-purple-500 transition-all"
              style={{
                width: `${(breakdown.wikipediaContribution / (breakdown.trendsContribution + breakdown.wikipediaContribution + breakdown.rankDeltaContribution || 1)) * 100}%`,
              }}
              title={`Wikipedia: ${breakdown.wikipediaNormalized}`}
            />
          )}
          {breakdown.rankDeltaNormalized !== null && (
            <div
              className="bg-green-500 transition-all"
              style={{
                width: `${(breakdown.rankDeltaContribution / (breakdown.trendsContribution + breakdown.wikipediaContribution + breakdown.rankDeltaContribution || 1)) * 100}%`,
              }}
              title={`Rank: ${breakdown.rankDeltaNormalized}`}
            />
          )}
        </div>
      )}

      {/* Expanded breakdown */}
      {expanded && showDetails && (
        <div className="mt-4 space-y-4 pt-4 border-t border-dust-grey">
          <ComponentBar
            label="Google Trends"
            icon="📈"
            rawValue={breakdown.trendsRaw}
            rawUnit="(0-100)"
            normalizedValue={breakdown.trendsNormalized}
            contribution={breakdown.trendsContribution}
            weight={breakdown.weights.trendsWeight}
            color="text-blue-600"
            maxContribution={maxContribution}
          />

          <ComponentBar
            label="Wikipedia Views"
            icon="📚"
            rawValue={breakdown.wikipediaRaw}
            rawUnit="views"
            normalizedValue={breakdown.wikipediaNormalized}
            contribution={breakdown.wikipediaContribution}
            weight={breakdown.weights.wikipediaWeight}
            color="text-purple-600"
            maxContribution={maxContribution}
          />

          <ComponentBar
            label="Rank Change"
            icon="🏆"
            rawValue={breakdown.rankDeltaRaw}
            rawUnit="positions"
            normalizedValue={breakdown.rankDeltaNormalized}
            contribution={breakdown.rankDeltaContribution}
            weight={breakdown.weights.rankDeltaWeight}
            color="text-green-600"
            maxContribution={maxContribution}
          />

          {/* Formula explanation */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <span className="font-medium">How it&apos;s calculated:</span> Each signal is
              normalized to 0-100, then weighted by importance. The final score is the
              weighted average of active signals.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Weights: Trends ({(breakdown.weights.trendsWeight * 100).toFixed(0)}%) + Wiki (
              {(breakdown.weights.wikipediaWeight * 100).toFixed(0)}%) + Rank (
              {(breakdown.weights.rankDeltaWeight * 100).toFixed(0)}%)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for use in tables/lists
 */
export function MomentumBreakdownInline({ breakdown }: { breakdown: MomentumBreakdownData }) {
  const scoreColor =
    breakdown.totalScore >= 70
      ? "text-green-600"
      : breakdown.totalScore >= 50
      ? "text-old-gold"
      : breakdown.totalScore >= 30
      ? "text-orange-500"
      : "text-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`font-bold ${scoreColor}`}>{breakdown.totalScore}</span>
      <div className="flex gap-0.5 h-1.5 w-16 rounded-full overflow-hidden bg-gray-100">
        {breakdown.trendsNormalized !== null && (
          <div
            className="bg-blue-500"
            style={{ flex: breakdown.trendsContribution || 0 }}
            title={`Trends: ${breakdown.trendsNormalized}`}
          />
        )}
        {breakdown.wikipediaNormalized !== null && (
          <div
            className="bg-purple-500"
            style={{ flex: breakdown.wikipediaContribution || 0 }}
            title={`Wiki: ${breakdown.wikipediaNormalized}`}
          />
        )}
        {breakdown.rankDeltaNormalized !== null && (
          <div
            className="bg-green-500"
            style={{ flex: breakdown.rankDeltaContribution || 0 }}
            title={`Rank: ${breakdown.rankDeltaNormalized}`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Tooltip content for momentum breakdown
 */
export function MomentumBreakdownTooltip({ breakdown }: { breakdown: MomentumBreakdownData }) {
  return (
    <div className="p-2 space-y-2 text-sm">
      <div className="font-medium border-b pb-1">Momentum Breakdown</div>

      <div className="flex justify-between gap-4">
        <span className="text-blue-600">📈 Trends:</span>
        <span>{breakdown.trendsNormalized ?? "-"}</span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-purple-600">📚 Wikipedia:</span>
        <span>{breakdown.wikipediaNormalized ?? "-"}</span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-green-600">🏆 Rank Δ:</span>
        <span>{breakdown.rankDeltaNormalized ?? "-"}</span>
      </div>

      <div className="border-t pt-1 flex justify-between font-medium">
        <span>Total:</span>
        <span>{breakdown.totalScore}</span>
      </div>
    </div>
  );
}
