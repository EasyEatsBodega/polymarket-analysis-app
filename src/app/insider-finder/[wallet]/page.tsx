"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import InsiderBadge, { BadgeType } from "@/components/InsiderBadge";

interface TradeDetail {
  id: string;
  conditionId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketCategory: string | null;
  outcomeName: string;
  side: string;
  size: number;
  price: number;
  usdValue: number;
  timestamp: string;
  transactionHash: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  won: boolean | null;
  pnl: number | null;
  priceAtTrade: number | null;
  price24hLater: number | null;
  daysToResolution: number | null;
  traderRank: number | null;
  badges: Array<{
    type: BadgeType;
    reason: string;
  }>;
}

interface BadgeDetail {
  id: string;
  type: BadgeType;
  tradeId: string | null;
  reason: string;
  metadata: Record<string, unknown> | null;
  earnedAt: string;
}

interface PositionSummary {
  conditionId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketCategory: string | null;
  outcomeName: string;
  totalSize: number;
  avgPrice: number;
  totalValue: number;
  resolved: boolean;
  won: boolean | null;
  pnl: number | null;
}

interface WalletData {
  id: string;
  address: string;
  proxyWallet: string | null;
  firstTradeAt: string;
  lastTradeAt: string;
  totalTrades: number;
  totalVolume: number;
  winRate: number | null;
  resolvedTrades: number;
  wonTrades: number;
  isTracked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  success: boolean;
  wallet: WalletData | null;
  badges: BadgeDetail[];
  trades: TradeDetail[];
  activePositions: PositionSummary[];
  resolvedPositions: PositionSummary[];
  stats: {
    totalPnl: number;
    avgTradeSize: number;
    largestTrade: number;
    uniqueMarkets: number;
    categoryCounts: Record<string, number>;
  };
  links: {
    polymarket: string;
    polygonscan: string;
  };
  error?: string;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(2)}M`;
  }
  if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(2)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-gray-400 hover:text-pine-blue transition-colors rounded hover:bg-gray-100"
      title="Copy address"
    >
      {copied ? (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="bg-white border border-dust-grey rounded-lg p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gunmetal mt-1">{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}

function PositionCard({ position }: { position: PositionSummary }) {
  const marketUrl = position.marketSlug
    ? `https://polymarket.com/event/${position.marketSlug}`
    : null;

  return (
    <div className="bg-white border border-dust-grey rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          {marketUrl ? (
            <a
              href={marketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gunmetal hover:text-pine-blue line-clamp-2"
            >
              {position.marketQuestion}
            </a>
          ) : (
            <p className="text-sm font-medium text-gunmetal line-clamp-2">
              {position.marketQuestion}
            </p>
          )}
        </div>
        {position.resolved && (
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              position.won
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {position.won ? "Won" : "Lost"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
          {position.outcomeName}
        </span>
        {position.marketCategory && (
          <span className="px-2 py-0.5 bg-blue-50 rounded text-xs text-blue-600 capitalize">
            {position.marketCategory}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Size</p>
          <p className="font-medium text-gunmetal">{position.totalSize.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Avg Price</p>
          <p className="font-medium text-gunmetal">{(position.avgPrice * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Value</p>
          <p className="font-medium text-gunmetal">{formatVolume(position.totalValue)}</p>
        </div>
      </div>

      {position.pnl !== null && (
        <div className="mt-3 pt-3 border-t border-dust-grey">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">P&L</span>
            <span
              className={`font-bold ${
                position.pnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {position.pnl >= 0 ? "+" : ""}
              {formatVolume(position.pnl)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: TradeDetail }) {
  const marketUrl = trade.marketSlug
    ? `https://polymarket.com/event/${trade.marketSlug}`
    : null;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatDate(trade.timestamp)}
      </td>
      <td className="px-4 py-3">
        {marketUrl ? (
          <a
            href={marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gunmetal hover:text-pine-blue line-clamp-1"
          >
            {trade.marketQuestion}
          </a>
        ) : (
          <span className="text-sm text-gunmetal line-clamp-1">
            {trade.marketQuestion}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-gunmetal">{trade.outcomeName}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            trade.side === "BUY"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {trade.side}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gunmetal">
        {(trade.price * 100).toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gunmetal">
        {formatVolume(trade.usdValue)}
      </td>
      <td className="px-4 py-3">
        {trade.resolved ? (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              trade.won
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {trade.won ? "Won" : "Lost"}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Open
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {trade.badges.map((badge, idx) => (
            <InsiderBadge
              key={`${badge.type}-${idx}`}
              type={badge.type}
              reason={badge.reason}
              size="sm"
              showLabel={false}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function WalletDetailPage() {
  const params = useParams();
  const walletAddress = params.wallet as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWallet() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/insider-finder/${walletAddress}`);
        const json: ApiResponse = await res.json();

        if (json.success) {
          setData(json);
        } else {
          throw new Error(json.error || "Failed to fetch wallet");
        }
      } catch (err) {
        console.error("Error fetching wallet:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch wallet");
      } finally {
        setLoading(false);
      }
    }

    if (walletAddress) {
      fetchWallet();
    }
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8" />
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data?.wallet) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-lg font-medium text-red-900 mb-2">Wallet Not Found</h2>
            <p className="text-red-700 mb-4">{error || "The requested wallet could not be found."}</p>
            <Link
              href="/insider-finder"
              className="text-pine-blue hover:underline font-medium"
            >
              ← Back to Insider Finder
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { wallet, badges, trades, activePositions, resolvedPositions, stats, links } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <Link
            href="/insider-finder"
            className="text-sm text-pine-blue hover:underline"
          >
            ← Back to Insider Finder
          </Link>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gunmetal font-mono">
                  {formatAddress(wallet.address)}
                </h1>
                <CopyButton text={wallet.address} />
              </div>
              <p className="text-gray-500 mt-1">
                First trade: {formatDate(wallet.firstTradeAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={links.polymarket}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-pine-blue text-white rounded-lg text-sm font-medium hover:bg-opacity-90 transition"
              >
                View on Polymarket
              </a>
              <a
                href={links.polygonscan}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-dust-grey rounded-lg text-sm font-medium text-gunmetal hover:bg-gray-50 transition"
              >
                View on PolygonScan
              </a>
            </div>
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {badges
                .filter((b, idx, arr) => arr.findIndex((x) => x.type === b.type) === idx)
                .map((badge) => (
                  <InsiderBadge
                    key={badge.id}
                    type={badge.type}
                    reason={badge.reason}
                    size="md"
                  />
                ))}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Volume"
            value={formatVolume(wallet.totalVolume)}
          />
          <StatCard
            label="Total Trades"
            value={wallet.totalTrades.toString()}
            subtext={`${stats.uniqueMarkets} unique markets`}
          />
          <StatCard
            label="Win Rate"
            value={
              wallet.winRate !== null
                ? `${(wallet.winRate * 100).toFixed(0)}%`
                : "-"
            }
            subtext={`${wallet.wonTrades}/${wallet.resolvedTrades} resolved`}
          />
          <StatCard
            label="Total P&L"
            value={
              stats.totalPnl >= 0
                ? `+${formatVolume(stats.totalPnl)}`
                : formatVolume(stats.totalPnl)
            }
          />
        </div>

        {/* Active Positions */}
        {activePositions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-gunmetal mb-4">
              Active Positions ({activePositions.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePositions.map((position, idx) => (
                <PositionCard key={`active-${idx}`} position={position} />
              ))}
            </div>
          </section>
        )}

        {/* Resolved Positions */}
        {resolvedPositions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-gunmetal mb-4">
              Resolved Positions ({resolvedPositions.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resolvedPositions.map((position, idx) => (
                <PositionCard key={`resolved-${idx}`} position={position} />
              ))}
            </div>
          </section>
        )}

        {/* Trade History */}
        <section>
          <h2 className="text-lg font-bold text-gunmetal mb-4">
            Trade History ({trades.length})
          </h2>
          <div className="bg-white border border-dust-grey rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-sm text-gray-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Market</th>
                    <th className="px-4 py-3 font-medium">Outcome</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Badges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dust-grey">
                  {trades.map((trade) => (
                    <TradeRow key={trade.id} trade={trade} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
