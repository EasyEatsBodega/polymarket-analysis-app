"use client";

import { useState, useEffect } from "react";
import OpportunityCard, { OpportunityData } from "./OpportunityCard";

interface OpportunityGridProps {
  type?: "SHOW" | "MOVIE";
  category?: string;
  minEdge?: number;
  showOnlyOpportunities?: boolean;
  limit?: number;
  compact?: boolean;
}

type SortOption = "rank" | "edge" | "momentum";

export default function OpportunityGrid({
  type,
  category,
  minEdge,
  showOnlyOpportunities = false,
  limit = 10,
  compact = false,
}: OpportunityGridProps) {
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("rank");

  useEffect(() => {
    async function fetchOpportunities() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (category) params.set("category", category);
        if (minEdge !== undefined) params.set("minEdge", minEdge.toString());
        if (showOnlyOpportunities) params.set("opportunitiesOnly", "true");
        params.set("limit", limit.toString());
        params.set("sort", sortBy);

        const response = await fetch(`/api/opportunities?${params}`);
        const data = await response.json();

        if (data.success) {
          setOpportunities(data.data);
        } else {
          setError(data.error || "Failed to fetch opportunities");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    fetchOpportunities();
  }, [type, category, minEdge, showOnlyOpportunities, limit, sortBy]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-gray-100 animate-pulse rounded-lg h-80"
          />
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

  if (opportunities.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <p className="text-gray-500">
          {showOnlyOpportunities
            ? "No opportunities found with the current filters."
            : "No data available."}
        </p>
        {showOnlyOpportunities && (
          <p className="text-sm text-gray-400 mt-2">
            Try lowering the minimum edge threshold.
          </p>
        )}
      </div>
    );
  }

  // Count signals
  const buyCount = opportunities.filter((o) => o.signal === "BUY").length;
  const avoidCount = opportunities.filter((o) => o.signal === "AVOID").length;

  return (
    <div className="space-y-4">
      {/* Header with sort and counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">{opportunities.length} titles</span>
          {buyCount > 0 && (
            <span className="text-green-600 font-medium">{buyCount} BUY</span>
          )}
          {avoidCount > 0 && (
            <span className="text-red-600 font-medium">{avoidCount} AVOID</span>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-pine-blue"
          >
            <option value="rank">Rank</option>
            <option value="edge">Edge</option>
            <option value="momentum">Momentum</option>
          </select>
        </div>
      </div>

      {/* Grid or list */}
      {compact ? (
        <div className="space-y-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              data={opportunity}
              compact={true}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              data={opportunity}
              compact={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
