"use client";

import { useState } from "react";

// Badge types and their configurations
export type BadgeType =
  | "HIGH_WIN_RATE"
  | "BIG_BET"
  | "LONG_SHOT"
  | "PRE_MOVE"
  | "LATE_WINNER"
  | "FIRST_MOVER"
  | "FRESH_WALLET"
  | "SINGLE_MARKET";

interface BadgeConfig {
  label: string;
  tooltip: string;
  icon: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const BADGE_CONFIGS: Record<BadgeType, BadgeConfig> = {
  HIGH_WIN_RATE: {
    label: "Win Rate",
    tooltip: "Won 80%+ of resolved positions",
    icon: "🎯",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    borderColor: "border-green-200",
  },
  BIG_BET: {
    label: "Big Bet",
    tooltip: "This trade was >50% of their total volume",
    icon: "💰",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-200",
  },
  LONG_SHOT: {
    label: "Long Shot",
    tooltip: "Bought at <25% probability and was correct",
    icon: "🎲",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
  },
  PRE_MOVE: {
    label: "Pre-Move",
    tooltip: "Price moved 20%+ within 24h of this trade",
    icon: "📈",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
  },
  LATE_WINNER: {
    label: "Late Winner",
    tooltip: "Correct bet placed within 7 days of resolution",
    icon: "⏰",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    borderColor: "border-orange-200",
  },
  FIRST_MOVER: {
    label: "First Mover",
    tooltip: "Among first 10 traders on this market",
    icon: "🚀",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
  },
  FRESH_WALLET: {
    label: "Fresh Wallet",
    tooltip: "Wallet is less than 7 days old",
    icon: "✨",
    bgColor: "bg-cyan-100",
    textColor: "text-cyan-700",
    borderColor: "border-cyan-200",
  },
  SINGLE_MARKET: {
    label: "Single Market",
    tooltip: "Only traded on one market",
    icon: "🎯",
    bgColor: "bg-pink-100",
    textColor: "text-pink-700",
    borderColor: "border-pink-200",
  },
};

interface InsiderBadgeProps {
  type: BadgeType;
  reason?: string;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function InsiderBadge({
  type,
  reason,
  showIcon = true,
  showLabel = true,
  size = "md",
}: InsiderBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = BADGE_CONFIGS[type];

  if (!config) {
    return null;
  }

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <div className="relative inline-block">
      <span
        className={`
          inline-flex items-center gap-1 rounded-full font-medium cursor-help
          ${config.bgColor} ${config.textColor} border ${config.borderColor}
          ${sizeClasses[size]}
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {showIcon && <span>{config.icon}</span>}
        {showLabel && <span>{config.label}</span>}
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48">
          <div className="bg-gunmetal text-white text-xs rounded-lg px-3 py-2 shadow-lg">
            <p className="font-medium mb-1">{config.label}</p>
            <p className="text-gray-300">{reason || config.tooltip}</p>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gunmetal" />
          </div>
        </div>
      )}
    </div>
  );
}

// Badge group component for displaying multiple badges
interface InsiderBadgeGroupProps {
  badges: Array<{
    type: BadgeType;
    reason?: string;
  }>;
  max?: number;
  size?: "sm" | "md" | "lg";
}

export function InsiderBadgeGroup({ badges, max = 4, size = "sm" }: InsiderBadgeGroupProps) {
  const displayBadges = badges.slice(0, max);
  const remaining = badges.length - max;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayBadges.map((badge, idx) => (
        <InsiderBadge
          key={`${badge.type}-${idx}`}
          type={badge.type}
          reason={badge.reason}
          size={size}
          showLabel={size !== "sm"}
        />
      ))}
      {remaining > 0 && (
        <span className="text-xs text-gray-500">+{remaining} more</span>
      )}
    </div>
  );
}

// Badge legend component
export function InsiderBadgeLegend() {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-dust-grey">
      <h4 className="font-medium text-gunmetal mb-3">Badge Legend</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(BADGE_CONFIGS).map(([type, config]) => (
          <div key={type} className="flex items-start gap-2">
            <span className="text-lg">{config.icon}</span>
            <div>
              <p className="text-sm font-medium text-gunmetal">{config.label}</p>
              <p className="text-xs text-gray-500">{config.tooltip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
