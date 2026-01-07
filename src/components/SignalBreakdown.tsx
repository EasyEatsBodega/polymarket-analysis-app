"use client";

import { MomentumBreakdownData } from "./MomentumBreakdown";

interface SignalBreakdownProps {
  momentumScore: number | null;
  momentumBreakdown: MomentumBreakdownData | null;
  reasoning?: string | null;
}

function getSignalStrength(value: number | null): { label: string; color: string } {
  if (value === null) return { label: "none", color: "text-gray-400" };
  if (value >= 70) return { label: "strong", color: "text-green-600" };
  if (value >= 50) return { label: "moderate", color: "text-yellow-600" };
  if (value >= 30) return { label: "weak", color: "text-orange-500" };
  return { label: "very weak", color: "text-red-500" };
}

// Tooltips explaining what each signal means
const SIGNAL_TOOLTIPS: Record<string, { title: string; description: string }> = {
  Trends: {
    title: "Google Trends (0-100)",
    description: "Search interest on Google. Higher = more people searching for this title. 70+ is strong interest, 30-70 moderate, below 30 weak.",
  },
  Wiki: {
    title: "Wikipedia Views (0-100)",
    description: "Daily Wikipedia pageviews, log-scaled. Higher = more people reading about this title. Good indicator of general audience interest.",
  },
  Rank: {
    title: "Rank Movement (0-100)",
    description: "How much the title is climbing or falling in Netflix rankings. 50 = no change, above 50 = climbing, below 50 = falling.",
  },
};

interface SignalChipProps {
  icon: string;
  label: string;
  value: number | null;
  color: string;
}

function SignalChip({ icon, label, value, color }: SignalChipProps) {
  const tooltip = SIGNAL_TOOLTIPS[label];
  const tooltipText = tooltip ? `${tooltip.title}\n\n${tooltip.description}` : "";

  if (value === null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-400 text-xs cursor-help"
        title={tooltipText ? `${tooltipText}\n\nNo data available` : "No data available"}
      >
        {icon} {label}: -
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-help ${color}`}
      title={tooltipText}
    >
      {icon} {label}: {value}
    </span>
  );
}

export default function SignalBreakdown({
  momentumScore,
  momentumBreakdown,
  reasoning,
}: SignalBreakdownProps) {
  // Extract values from breakdown or use null
  const trendsValue = momentumBreakdown?.trendsNormalized ?? null;
  const wikiValue = momentumBreakdown?.wikipediaNormalized ?? null;
  const rankValue = momentumBreakdown?.rankDeltaNormalized ?? null;

  // Count active signals
  const activeSignals = [trendsValue, wikiValue, rankValue].filter(v => v !== null).length;

  return (
    <div className="space-y-3">
      {/* Signal chips */}
      <div className="flex flex-wrap gap-2">
        <SignalChip
          icon="📈"
          label="Trends"
          value={trendsValue}
          color={trendsValue !== null ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}
        />
        <SignalChip
          icon="📚"
          label="Wiki"
          value={wikiValue}
          color={wikiValue !== null ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}
        />
        <SignalChip
          icon="📊"
          label="Rank"
          value={rankValue}
          color={rankValue !== null ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}
        />
      </div>

      {/* Momentum summary */}
      {momentumScore !== null && (
        <div
          className="flex items-center gap-2 text-sm cursor-help"
          title="Overall Momentum Score (0-100)&#10;&#10;Combined score from Trends, Wiki, and Rank signals. Higher momentum suggests the title is gaining attention and may perform better in rankings.&#10;&#10;70+ = Strong momentum&#10;50-70 = Moderate momentum&#10;30-50 = Weak momentum&#10;Below 30 = Very weak momentum"
        >
          <span className="text-gray-500">Momentum:</span>
          <span className={`font-bold ${getSignalStrength(momentumScore).color}`}>
            {momentumScore}
          </span>
          <span className="text-gray-400">({getSignalStrength(momentumScore).label})</span>
          {activeSignals < 3 && (
            <span className="text-xs text-gray-400">
              ({activeSignals}/3 signals)
            </span>
          )}
        </div>
      )}

      {/* Reasoning text */}
      {reasoning && (
        <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg p-2">
          &quot;{reasoning}&quot;
        </p>
      )}
    </div>
  );
}

/**
 * Compact version for smaller displays
 */
export function SignalBreakdownCompact({
  momentumScore,
  momentumBreakdown,
}: {
  momentumScore: number | null;
  momentumBreakdown: MomentumBreakdownData | null;
}) {
  const trendsValue = momentumBreakdown?.trendsNormalized ?? null;
  const wikiValue = momentumBreakdown?.wikipediaNormalized ?? null;
  const rankValue = momentumBreakdown?.rankDeltaNormalized ?? null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {trendsValue !== null && (
        <span className="text-blue-600">📈{trendsValue}</span>
      )}
      {wikiValue !== null && (
        <span className="text-purple-600">📚{wikiValue}</span>
      )}
      {rankValue !== null && (
        <span className="text-green-600">📊{rankValue}</span>
      )}
      {momentumScore !== null && (
        <span className={`font-bold ${getSignalStrength(momentumScore).color}`}>
          = {momentumScore}
        </span>
      )}
    </div>
  );
}
