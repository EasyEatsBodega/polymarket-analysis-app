"use client";

import { useState } from "react";
import Link from "next/link";
import { InsiderBadgeGroup, BadgeType } from "./InsiderBadge";

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

interface InsiderFinderTableProps {
  wallets: InsiderWallet[];
  loading?: boolean;
  error?: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (field: string) => void;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(1)}M`;
  }
  if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

function formatWinRate(winRate: number | null, resolved: number): string {
  if (winRate === null || resolved === 0) {
    return "-";
  }
  return `${(winRate * 100).toFixed(0)}%`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 text-gray-400 hover:text-pine-blue transition-colors"
      title="Copy address"
    >
      {copied ? (
        <svg
          className="w-4 h-4 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

function SortIcon({
  field,
  currentSort,
  sortOrder,
}: {
  field: string;
  currentSort: string;
  sortOrder: "asc" | "desc";
}) {
  if (currentSort !== field) {
    return (
      <svg
        className="w-4 h-4 text-gray-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }

  return sortOrder === "asc" ? (
    <svg
      className="w-4 h-4 text-pine-blue"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 15l7-7 7 7"
      />
    </svg>
  ) : (
    <svg
      className="w-4 h-4 text-pine-blue"
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
  );
}

function LoadingRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-24" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-40" />
        <div className="h-3 bg-gray-200 rounded w-24 mt-1" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-20" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-8" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-16" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-12" />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <div className="h-5 bg-gray-200 rounded-full w-16" />
          <div className="h-5 bg-gray-200 rounded-full w-16" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-200 rounded w-8" />
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <svg
        className="w-16 h-16 mx-auto text-gray-300 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-gray-500 text-lg font-medium">No insider wallets found</p>
      <p className="text-gray-400 text-sm mt-1">
        Try adjusting your filters or check back later
      </p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = [];
  const maxVisible = 5;

  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  const endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-dust-grey disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Previous
      </button>

      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-dust-grey hover:bg-gray-50"
          >
            1
          </button>
          {startPage > 2 && <span className="px-2 text-gray-400">...</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-1.5 text-sm rounded-lg border ${
            p === page
              ? "bg-pine-blue text-white border-pine-blue"
              : "border-dust-grey hover:bg-gray-50"
          }`}
        >
          {p}
        </button>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && (
            <span className="px-2 text-gray-400">...</span>
          )}
          <button
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-1.5 text-sm rounded-lg border border-dust-grey hover:bg-gray-50"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-dust-grey disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next
      </button>
    </div>
  );
}

export default function InsiderFinderTable({
  wallets,
  loading = false,
  error = null,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}: InsiderFinderTableProps) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Error loading insider wallets</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-dust-grey rounded-lg overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left text-sm text-gray-500">
              <th className="px-4 py-3 font-medium">Wallet</th>
              <th className="px-4 py-3 font-medium">Market</th>
              <th
                className="px-4 py-3 font-medium cursor-pointer hover:text-gunmetal"
                onClick={() => onSortChange("firstTradeAt")}
              >
                <div className="flex items-center gap-1">
                  First Trade
                  <SortIcon
                    field="firstTradeAt"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                  />
                </div>
              </th>
              <th
                className="px-4 py-3 font-medium cursor-pointer hover:text-gunmetal"
                onClick={() => onSortChange("totalTrades")}
              >
                <div className="flex items-center gap-1">
                  Trades
                  <SortIcon
                    field="totalTrades"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                  />
                </div>
              </th>
              <th
                className="px-4 py-3 font-medium cursor-pointer hover:text-gunmetal"
                onClick={() => onSortChange("totalVolume")}
              >
                <div className="flex items-center gap-1">
                  Volume
                  <SortIcon
                    field="totalVolume"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                  />
                </div>
              </th>
              <th
                className="px-4 py-3 font-medium cursor-pointer hover:text-gunmetal"
                onClick={() => onSortChange("winRate")}
              >
                <div className="flex items-center gap-1">
                  Win Rate
                  <SortIcon
                    field="winRate"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                  />
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Badges</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dust-grey">
            {loading ? (
              <>
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
              </>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState />
                </td>
              </tr>
            ) : (
              wallets.map((wallet) => (
                <tr
                  key={wallet.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gunmetal">
                        {formatAddress(wallet.address)}
                      </code>
                      <CopyButton text={wallet.address} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {wallet.recentTrades.length > 0 ? (
                      <div className="max-w-[200px]">
                        <p className="text-sm text-gunmetal truncate" title={wallet.recentTrades[0].marketQuestion}>
                          {wallet.recentTrades[0].marketQuestion}
                        </p>
                        <p className="text-xs text-gray-500">
                          {wallet.recentTrades[0].side} {wallet.recentTrades[0].outcomeName} @ {(wallet.recentTrades[0].price * 100).toFixed(0)}¢
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(wallet.firstTradeAt)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gunmetal">
                    {wallet.totalTrades}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gunmetal">
                    {formatVolume(wallet.totalVolume)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${
                        wallet.winRate !== null && wallet.winRate >= 0.8
                          ? "text-green-600"
                          : wallet.winRate !== null && wallet.winRate >= 0.5
                          ? "text-yellow-600"
                          : "text-gray-500"
                      }`}
                    >
                      {formatWinRate(wallet.winRate, wallet.resolvedTrades)}
                    </span>
                    {wallet.resolvedTrades > 0 && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({wallet.wonTrades}/{wallet.resolvedTrades})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <InsiderBadgeGroup
                      badges={wallet.badges.map((b) => ({
                        type: b.type as BadgeType,
                        reason: b.reason,
                      }))}
                      max={3}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/insider-finder/${wallet.address}`}
                      className="text-pine-blue hover:underline text-sm font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-dust-grey p-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
