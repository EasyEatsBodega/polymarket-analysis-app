"use client";

import { ConsensusResult } from "@/lib/consensusCalculator";

interface ConsensusEstimateProps {
  nomineeName: string;
  subtitle?: string | null;
  consensus: ConsensusResult;
}

const SOURCE_LABELS: Record<string, string> = {
  POLYMARKET: "Polymarket",
  MYBOOKIE: "MyBookie",
  BOVADA: "Bovada",
  GOLDDERBY: "Gold Derby",
  DRAFTKINGS: "DraftKings",
  BETMGM: "BetMGM",
};

const SOURCE_COLORS: Record<string, string> = {
  POLYMARKET: "bg-purple-500",
  MYBOOKIE: "bg-blue-500",
  BOVADA: "bg-red-500",
  GOLDDERBY: "bg-amber-500",
  DRAFTKINGS: "bg-green-500",
  BETMGM: "bg-orange-500",
};

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = {
    high: {
      bg: "bg-green-100",
      text: "text-green-700",
      label: "High Confidence",
      icon: "●●●",
    },
    medium: {
      bg: "bg-amber-100",
      text: "text-amber-700",
      label: "Medium Confidence",
      icon: "●●○",
    },
    low: {
      bg: "bg-gray-100",
      text: "text-gray-600",
      label: "Low Confidence",
      icon: "●○○",
    },
  };

  const c = config[confidence];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      <span className="tracking-tighter">{c.icon}</span>
      {c.label}
    </span>
  );
}

export default function ConsensusEstimate({
  nomineeName,
  subtitle,
  consensus,
}: ConsensusEstimateProps) {
  const percentage = Math.round(consensus.probability * 100);
  const sources = Object.entries(consensus.breakdown);

  if (consensus.sourceCount === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="text-center text-gray-500">
          No odds data available for this category
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-pine-blue/5 to-old-gold/5 border border-pine-blue/20 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-pine-blue uppercase tracking-wide">
            PredictEasy Estimate
          </span>
          <ConfidenceBadge confidence={consensus.confidence} />
        </div>
        <span className="text-xs text-gray-500">
          {consensus.sourceCount} source{consensus.sourceCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Main Estimate */}
      <div className="mb-4">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-4xl font-bold text-gunmetal">{percentage}%</span>
          <div>
            <span className="font-semibold text-gunmetal">{nomineeName}</span>
            {subtitle && (
              <span className="text-gray-500 ml-2 text-sm">{subtitle}</span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pine-blue to-old-gold rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Source Breakdown */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase">Source Breakdown</div>
        <div className="flex flex-wrap gap-2">
          {sources.map(([source, prob]) => (
            <div
              key={source}
              className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-gray-200"
            >
              <span
                className={`w-2 h-2 rounded-full ${SOURCE_COLORS[source] || "bg-gray-400"}`}
              />
              <span className="text-xs text-gray-600">
                {SOURCE_LABELS[source] || source}
              </span>
              <span className="text-xs font-semibold text-gunmetal">
                {Math.round(prob * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Agreement Indicator */}
      {consensus.sourceCount >= 2 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Source Agreement</span>
            <div className="flex items-center gap-2">
              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-full rounded-full ${
                    consensus.agreement >= 0.8
                      ? "bg-green-500"
                      : consensus.agreement >= 0.5
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${consensus.agreement * 100}%` }}
                />
              </div>
              <span className="text-gray-600 font-medium">
                {Math.round(consensus.agreement * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
