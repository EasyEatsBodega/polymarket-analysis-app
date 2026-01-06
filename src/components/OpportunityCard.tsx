"use client";

import SignalIndicator, { Signal, SignalStrength } from "./SignalIndicator";
import RankForecast from "./RankForecast";
import EdgeComparison from "./EdgeComparison";
import SignalBreakdown from "./SignalBreakdown";
import { MomentumBreakdownData } from "./MomentumBreakdown";

export interface OpportunityData {
  id: string;
  title: string;
  type: "SHOW" | "MOVIE";
  category: string;

  // Rank data
  currentRank: number | null;
  previousRank: number | null;
  forecastP50: number | null;
  forecastP10: number | null;
  forecastP90: number | null;

  // Market data
  hasMarket: boolean;
  marketProbability: number | null;
  modelProbability: number | null;
  edgePercent: number | null;
  polymarketUrl: string | null;

  // Signal classification
  signal: Signal;
  signalStrength: SignalStrength;
  confidence: "low" | "medium" | "high";

  // Momentum
  momentumScore: number | null;
  momentumBreakdown: MomentumBreakdownData | null;
  reasoning: string | null;
}

interface OpportunityCardProps {
  data: OpportunityData;
  compact?: boolean;
}

function TypeBadge({ type }: { type: "SHOW" | "MOVIE" }) {
  const config = type === "SHOW"
    ? { bg: "bg-blue-100", text: "text-blue-700", label: "TV" }
    : { bg: "bg-purple-100", text: "text-purple-700", label: "FILM" };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "low" | "medium" | "high" }) {
  const config = {
    low: { color: "text-red-500", label: "Low confidence" },
    medium: { color: "text-yellow-600", label: "Medium confidence" },
    high: { color: "text-green-600", label: "High confidence" },
  };

  return (
    <span className={`text-xs ${config[confidence].color}`}>
      {config[confidence].label}
    </span>
  );
}

export default function OpportunityCard({ data, compact = false }: OpportunityCardProps) {
  if (compact) {
    return <OpportunityCardCompact data={data} />;
  }

  return (
    <div className="bg-white border border-dust-grey rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dust-grey bg-gray-50">
        <div className="flex items-center gap-2">
          <TypeBadge type={data.type} />
          <h3 className="font-semibold text-gunmetal truncate max-w-[200px]" title={data.title}>
            {data.title}
          </h3>
        </div>
        <SignalIndicator signal={data.signal} strength={data.signalStrength} />
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Rank Forecast Section */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Rank Forecast</h4>
          <RankForecast
            currentRank={data.currentRank}
            forecastP50={data.forecastP50}
            forecastP10={data.forecastP10}
            forecastP90={data.forecastP90}
          />
        </div>

        {/* Edge Section */}
        {data.hasMarket && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Betting Edge</h4>
            <EdgeComparison
              marketProbability={data.marketProbability}
              modelProbability={data.modelProbability}
              edgePercent={data.edgePercent}
            />
          </div>
        )}

        {/* Signal Breakdown */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Why This Signal</h4>
          <SignalBreakdown
            momentumScore={data.momentumScore}
            momentumBreakdown={data.momentumBreakdown}
            reasoning={data.reasoning}
          />
        </div>

        {/* Confidence */}
        <div className="flex justify-between items-center pt-2 border-t border-dust-grey">
          <ConfidenceBadge confidence={data.confidence} />

          {data.polymarketUrl && (
            <a
              href={data.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-pine-blue hover:text-pine-blue/80 font-medium"
            >
              Trade on Polymarket
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for list views
 */
function OpportunityCardCompact({ data }: { data: OpportunityData }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-white border border-dust-grey rounded-lg hover:bg-gray-50 transition-colors">
      {/* Rank */}
      <div className="text-center min-w-[50px]">
        <span className="text-2xl font-bold text-gunmetal">#{data.currentRank ?? "?"}</span>
      </div>

      {/* Title and type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TypeBadge type={data.type} />
          <span className="font-medium text-gunmetal truncate">{data.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          {data.forecastP50 !== null && (
            <span>Predicted: #{data.forecastP50}</span>
          )}
          {data.momentumScore !== null && (
            <span>Momentum: {data.momentumScore}</span>
          )}
        </div>
      </div>

      {/* Edge */}
      {data.hasMarket && data.edgePercent !== null && (
        <div className="text-right">
          <span className={`text-lg font-bold ${
            data.edgePercent > 5 ? "text-green-600" :
            data.edgePercent < -5 ? "text-red-600" : "text-gray-500"
          }`}>
            {data.edgePercent > 0 ? "+" : ""}{data.edgePercent.toFixed(0)}%
          </span>
          <div className="text-xs text-gray-500">edge</div>
        </div>
      )}

      {/* Signal */}
      <SignalIndicator signal={data.signal} strength={data.signalStrength} size="sm" />
    </div>
  );
}
