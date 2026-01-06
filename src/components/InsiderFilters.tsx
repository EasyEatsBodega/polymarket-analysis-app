"use client";

import { useState } from "react";
import { BadgeType } from "./InsiderBadge";

export interface InsiderFiltersState {
  timeframe: number;
  badges: BadgeType[];
  categories: string[];
  side: "all" | "buy" | "sell";
  minSize: number | null;
  maxSize: number | null;
}

interface InsiderFiltersProps {
  filters: InsiderFiltersState;
  onFiltersChange: (filters: InsiderFiltersState) => void;
  availableCategories?: string[];
}

const TIMEFRAME_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
];

const BADGE_OPTIONS: { value: BadgeType; label: string }[] = [
  { value: "HIGH_WIN_RATE", label: "High Win Rate" },
  { value: "BIG_BET", label: "Big Bet" },
  { value: "LONG_SHOT", label: "Long Shot" },
  { value: "PRE_MOVE", label: "Pre-Move" },
  { value: "LATE_WINNER", label: "Late Winner" },
  { value: "FIRST_MOVER", label: "First Mover" },
  { value: "FRESH_WALLET", label: "Fresh Wallet" },
  { value: "SINGLE_MARKET", label: "Single Market" },
];

const SIDE_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "buy" as const, label: "Buys" },
  { value: "sell" as const, label: "Sells" },
];

const DEFAULT_CATEGORIES = [
  "politics",
  "entertainment",
  "science",
  "business",
  "technology",
  "economics",
  "culture",
  "other",
];

export default function InsiderFilters({
  filters,
  onFiltersChange,
  availableCategories = DEFAULT_CATEGORIES,
}: InsiderFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTimeframeChange = (value: number) => {
    onFiltersChange({ ...filters, timeframe: value });
  };

  const handleSideChange = (value: "all" | "buy" | "sell") => {
    onFiltersChange({ ...filters, side: value });
  };

  const handleBadgeToggle = (badge: BadgeType) => {
    const newBadges = filters.badges.includes(badge)
      ? filters.badges.filter((b) => b !== badge)
      : [...filters.badges, badge];
    onFiltersChange({ ...filters, badges: newBadges });
  };

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const handleMinSizeChange = (value: string) => {
    const numValue = value ? parseFloat(value) : null;
    onFiltersChange({ ...filters, minSize: numValue });
  };

  const handleMaxSizeChange = (value: string) => {
    const numValue = value ? parseFloat(value) : null;
    onFiltersChange({ ...filters, maxSize: numValue });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      timeframe: 30,
      badges: [],
      side: "all",
      categories: [],
      minSize: null,
      maxSize: null,
    });
  };

  const activeFilterCount =
    filters.badges.length +
    filters.categories.length +
    (filters.side !== "all" ? 1 : 0) +
    (filters.minSize !== null ? 1 : 0) +
    (filters.maxSize !== null ? 1 : 0);

  return (
    <div className="bg-white border border-dust-grey rounded-lg">
      {/* Filter Header */}
      <div className="flex items-center justify-between p-4 border-b border-dust-grey">
        <div className="flex items-center gap-4">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Timeframe:</span>
            <div className="flex rounded-lg border border-dust-grey overflow-hidden">
              {TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleTimeframeChange(option.value)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    filters.timeframe === option.value
                      ? "bg-pine-blue text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

{/* Side Selector */}          <div className="flex items-center gap-2">            <span className="text-sm text-gray-500">Side:</span>            <div className="flex rounded-lg border border-dust-grey overflow-hidden">              {SIDE_OPTIONS.map((option) => (                <button                  key={option.value}                  onClick={() => handleSideChange(option.value)}                  className={`px-3 py-1.5 text-sm transition-colors ${                    filters.side === option.value                      ? "bg-pine-blue text-white"                      : "bg-white text-gray-600 hover:bg-gray-50"                  }`}                >                  {option.label}                </button>              ))}            </div>          </div>
          {/* Active Filter Count */}
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-pine-blue text-white text-xs rounded-full">
              {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-gray-500 hover:text-gunmetal"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-sm text-pine-blue hover:underline"
          >
            {isExpanded ? "Hide filters" : "More filters"}
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-gray-50">
          {/* Badge Filter */}
          <div>
            <label className="block text-sm font-medium text-gunmetal mb-2">
              Badge Types
            </label>
            <div className="flex flex-wrap gap-2">
              {BADGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleBadgeToggle(option.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    filters.badges.includes(option.value)
                      ? "bg-pine-blue text-white"
                      : "bg-white border border-dust-grey text-gray-600 hover:border-pine-blue"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gunmetal mb-2">
              Market Categories
            </label>
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryToggle(category)}
                  className={`px-3 py-1.5 rounded-full text-sm capitalize transition-colors ${
                    filters.categories.includes(category)
                      ? "bg-pine-blue text-white"
                      : "bg-white border border-dust-grey text-gray-600 hover:border-pine-blue"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Position Size Filter */}
          <div>
            <label className="block text-sm font-medium text-gunmetal mb-2">
              Position Size (USD)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minSize ?? ""}
                  onChange={(e) => handleMinSizeChange(e.target.value)}
                  className="w-32 pl-7 pr-3 py-2 border border-dust-grey rounded-lg text-sm focus:outline-none focus:border-pine-blue"
                />
              </div>
              <span className="text-gray-400">to</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxSize ?? ""}
                  onChange={(e) => handleMaxSizeChange(e.target.value)}
                  className="w-32 pl-7 pr-3 py-2 border border-dust-grey rounded-lg text-sm focus:outline-none focus:border-pine-blue"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
