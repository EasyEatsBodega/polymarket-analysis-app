"use client";

interface EdgeComparisonProps {
  marketProbability: number | null;
  modelProbability: number | null;
  edgePercent: number | null;
  compact?: boolean;
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${Math.round(value * 100)}%`;
}

function getEdgeColor(edge: number | null): string {
  if (edge === null) return "text-gray-500";
  if (edge > 10) return "text-green-600";
  if (edge > 5) return "text-green-500";
  if (edge < -10) return "text-red-600";
  if (edge < -5) return "text-red-500";
  return "text-gray-500";
}

function getEdgeLabel(edge: number | null): string {
  if (edge === null) return "";
  if (edge > 5) return "underpriced";
  if (edge < -5) return "overpriced";
  return "fair value";
}

export default function EdgeComparison({
  marketProbability,
  modelProbability,
  edgePercent,
  compact = false,
}: EdgeComparisonProps) {
  const hasMarketData = marketProbability !== null;
  const hasModelData = modelProbability !== null;

  if (!hasMarketData) {
    return (
      <div className="text-center py-3">
        <span className="text-gray-400 text-sm">No Polymarket data</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Market: {formatPercent(marketProbability)}</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-600">Model: {formatPercent(modelProbability)}</span>
        {edgePercent !== null && (
          <>
            <span className="text-gray-400">=</span>
            <span className={`font-bold ${getEdgeColor(edgePercent)}`}>
              {edgePercent > 0 ? "+" : ""}
              {edgePercent.toFixed(0)}%
            </span>
          </>
        )}
      </div>
    );
  }

  const marketPercent = marketProbability !== null ? marketProbability * 100 : 0;
  const modelPercent = modelProbability !== null ? modelProbability * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Probability bars */}
      <div className="space-y-2">
        {/* Market bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Market</span>
            <span className="font-medium text-gray-700">{formatPercent(marketProbability)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-400 transition-all duration-300"
              style={{ width: `${marketPercent}%` }}
            />
          </div>
        </div>

        {/* Model bar */}
        {hasModelData && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Model</span>
              <span className="font-medium text-pine-blue">{formatPercent(modelProbability)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-pine-blue transition-all duration-300"
                style={{ width: `${modelPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Edge display */}
      {edgePercent !== null && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <span className={`text-2xl font-bold ${getEdgeColor(edgePercent)}`}>
            {edgePercent > 0 ? "+" : ""}
            {edgePercent.toFixed(0)}%
          </span>
          <span className="text-sm text-gray-500 uppercase">
            edge ({getEdgeLabel(edgePercent)})
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Mini inline version for table cells
 */
export function EdgeComparisonInline({
  marketProbability,
  modelProbability,
  edgePercent,
}: {
  marketProbability: number | null;
  modelProbability: number | null;
  edgePercent: number | null;
}) {
  if (marketProbability === null) {
    return <span className="text-gray-400 text-sm">No market</span>;
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500">{formatPercent(marketProbability)}</span>
      <span className="text-gray-400">vs</span>
      <span className="text-pine-blue">{formatPercent(modelProbability)}</span>
      {edgePercent !== null && (
        <span className={`font-bold ${getEdgeColor(edgePercent)}`}>
          ({edgePercent > 0 ? "+" : ""}{edgePercent.toFixed(0)}%)
        </span>
      )}
    </div>
  );
}
