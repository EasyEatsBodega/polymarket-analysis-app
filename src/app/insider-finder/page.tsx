"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InsiderFilters, { InsiderFiltersState } from "@/components/InsiderFilters";
import InsiderFinderTable from "@/components/InsiderFinderTable";
import { InsiderBadgeLegend, BadgeType } from "@/components/InsiderBadge";

interface InsiderWallet {
  id: string;
  address: string;
  firstTradeAt: string;
  lastTradeAt: string;
  totalTrades: number;
  totalVolume: number;
  winRate: number | null;
  resolvedTrades: number;
  wonTrades: number;
  badges: Array<{
    type: BadgeType;
    reason: string;
    earnedAt: string;
  }>;
  recentTrades: Array<{
    id: string;
    marketQuestion: string;
    marketSlug: string | null;
    marketCategory: string | null;
    outcomeName: string;
    side: string;
    price: number;
    usdValue: number;
    timestamp: string;
    won: boolean | null;
  }>;
}

interface ApiResponse {
  success: boolean;
  data: InsiderWallet[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    filters: {
      timeframe: number;
      badges: string[];
      categories: string[];
      minSize: number | null;
      maxSize: number | null;
    };
  };
  error?: string;
}

export default function InsiderFinderPage() {
  const [wallets, setWallets] = useState<InsiderWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("firstTradeAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showLegend, setShowLegend] = useState(false);

  const [filters, setFilters] = useState<InsiderFiltersState>({
    timeframe: 30,
    badges: [],
    categories: [],
    minSize: null,
    maxSize: null,
  });

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      params.set("timeframe", filters.timeframe.toString());
      params.set("sort", sortBy);
      params.set("order", sortOrder);

      if (filters.badges.length > 0) {
        params.set("badges", filters.badges.join(","));
      }
      if (filters.categories.length > 0) {
        params.set("categories", filters.categories.join(","));
      }
      if (filters.minSize !== null) {
        params.set("minSize", filters.minSize.toString());
      }
      if (filters.maxSize !== null) {
        params.set("maxSize", filters.maxSize.toString());
      }

      const res = await fetch(`/api/insider-finder?${params}`);
      const data: ApiResponse = await res.json();

      if (data.success) {
        setWallets(data.data);
        setTotalPages(data.meta.totalPages);
        setTotal(data.meta.total);
      } else {
        throw new Error(data.error || "Failed to fetch wallets");
      }
    } catch (err) {
      console.error("Error fetching insider wallets:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch wallets");
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleFiltersChange = (newFilters: InsiderFiltersState) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSortChange = (field: string) => {
    if (field === sortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gunmetal">Insider Finder</h1>
              <p className="text-gray-600 mt-1">
                Detect potential insider trading patterns on Polymarket
              </p>
            </div>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="text-sm text-pine-blue hover:underline flex items-center gap-1"
            >
              {showLegend ? "Hide" : "Show"} badge legend
              <svg
                className={`w-4 h-4 transition-transform ${showLegend ? "rotate-180" : ""}`}
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

          {/* Badge Legend */}
          {showLegend && (
            <div className="mt-4">
              <InsiderBadgeLegend />
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6">
          <InsiderFilters filters={filters} onFiltersChange={handleFiltersChange} />
        </div>

        {/* Results Summary */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {loading ? (
              "Loading..."
            ) : (
              <>
                Found <span className="font-semibold text-gunmetal">{total}</span> suspicious
                wallets
              </>
            )}
          </p>
          <button
            onClick={fetchWallets}
            disabled={loading}
            className="text-sm text-pine-blue hover:underline disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {/* Table */}
        <InsiderFinderTable
          wallets={wallets}
          loading={loading}
          error={error}
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">How Insider Detection Works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              <strong>New Wallets:</strong> First trade within the selected timeframe
            </li>
            <li>
              <strong>Limited Activity:</strong> Less than 5 total trades
            </li>
            <li>
              <strong>Significant Bets:</strong> Minimum trade size of $500
            </li>
            <li>
              <strong>Filtered Markets:</strong> Excludes Crypto and Sports categories
            </li>
          </ul>
          <p className="text-xs text-blue-600 mt-3">
            Note: This tool identifies suspicious patterns but does not prove insider trading.
            Always conduct your own research.
          </p>
        </div>
      </main>
    </div>
  );
}
