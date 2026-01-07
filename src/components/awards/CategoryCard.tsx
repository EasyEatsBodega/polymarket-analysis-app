"use client";

import Link from "next/link";
import { useMemo } from "react";

interface OddsData {
  source: string;
  probability: number;
  url: string | null;
}

interface NomineeData {
  id: string;
  name: string;
  subtitle: string | null;
  isWinner: boolean;
  odds: OddsData[];
  polymarketOdds: number | null;
  maxEdge: number | null;
  edgeSource: string | null;
}

interface CategoryCardProps {
  name: string;
  slug: string;
  showSlug: string;
  polymarketUrl: string | null;
  isClosed: boolean;
  leader: NomineeData | null;
  nominees: NomineeData[];
}

// Source configuration for badges
const SOURCE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  GOLDDERBY: { label: "Gold Derby", color: "text-amber-700", bgColor: "bg-amber-100" },
  MYBOOKIE: { label: "MyBookie", color: "text-blue-700", bgColor: "bg-blue-100" },
  BOVADA: { label: "Bovada", color: "text-red-700", bgColor: "bg-red-100" },
  POLYMARKET: { label: "Polymarket", color: "text-purple-700", bgColor: "bg-purple-100" },
};

// Simple consensus calculation for the card (weighted average)
const WEIGHTS: Record<string, number> = {
  POLYMARKET: 0.35,
  MYBOOKIE: 0.15,
  BOVADA: 0.15,
  GOLDDERBY: 0.25,
  DRAFTKINGS: 0.05,
  BETMGM: 0.05,
};

function calculateSimpleConsensus(odds: OddsData[]): number | null {
  if (odds.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const o of odds) {
    const weight = WEIGHTS[o.source] || 0.05;
    weightedSum += o.probability * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function ConsensusBar({ probability }: { probability: number }) {
  const percentage = Math.round(probability * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pine-blue to-old-gold rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-bold text-gunmetal min-w-[40px] text-right">
        {percentage}%
      </span>
    </div>
  );
}

function OddsBar({ probability, color = "bg-pine-blue" }: { probability: number; color?: string }) {
  const percentage = Math.round(probability * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gunmetal min-w-[40px] text-right">
        {percentage}%
      </span>
    </div>
  );
}

function EdgeBadge({ edge }: { edge: number }) {
  const isPositive = edge > 0;
  const colorClass = isPositive ? "text-green-600" : "text-red-600";
  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {isPositive ? "+" : ""}{edge.toFixed(0)}%
    </span>
  );
}

function WinnerBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L5.1 17l.9-5.3-4-3.9L7.5 7 10 2z" clipRule="evenodd" />
      </svg>
      Winner
    </span>
  );
}

function ClosedBadge() {
  return (
    <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-medium">
      Resolved
    </span>
  );
}

export default function CategoryCard({
  name,
  slug,
  showSlug,
  polymarketUrl,
  isClosed,
  leader,
  nominees,
}: CategoryCardProps) {
  // Find biggest edge in this category
  const biggestEdge = nominees.reduce((max, n) => {
    if (n.maxEdge !== null && Math.abs(n.maxEdge) > Math.abs(max)) {
      return n.maxEdge;
    }
    return max;
  }, 0);

  const hasSignificantEdge = Math.abs(biggestEdge) > 5;

  // Determine which sources are present in this category
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    for (const nominee of nominees) {
      for (const odd of nominee.odds) {
        sources.add(odd.source);
      }
    }
    return sources;
  }, [nominees]);

  const hasGoldDerby = availableSources.has("GOLDDERBY");
  const hasSportsbook = availableSources.has("MYBOOKIE") || availableSources.has("BOVADA");
  const sourceCount = availableSources.size;

  // Debug logging
  if (typeof window !== 'undefined' && name === "Best Director") {
    console.log(`[CategoryCard] ${name}:`, {
      sourceCount,
      availableSources: Array.from(availableSources),
      hasGoldDerby,
      hasSportsbook,
      leaderOddsCount: leader?.odds?.length,
      firstNomineeOdds: nominees[0]?.odds?.map(o => o.source),
    });
  }

  // Calculate consensus for leader
  const leaderConsensus = useMemo(() => {
    if (!leader) return null;
    return calculateSimpleConsensus(leader.odds);
  }, [leader]);

  return (
    <Link
      href={`/awards/${showSlug}/${slug}`}
      className={`block bg-white border rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-pine-blue/50 ${
        isClosed ? "opacity-70 border-dust-grey" : hasSignificantEdge ? "border-old-gold" : "border-dust-grey"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gunmetal">{name}</h3>
          {isClosed && <ClosedBadge />}
          {hasSignificantEdge && !isClosed && (
            <span className="px-2 py-0.5 bg-old-gold/20 text-old-gold rounded text-xs font-medium">
              Edge
            </span>
          )}
        </div>
        <svg
          className="w-5 h-5 text-gray-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* Source Badges - show when we have extra data sources */}
      {(hasGoldDerby || hasSportsbook) && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {hasGoldDerby && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Expert Consensus
            </span>
          )}
          {hasSportsbook && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Sportsbook
            </span>
          )}
          {sourceCount >= 3 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
              {sourceCount} sources
            </span>
          )}
        </div>
      )}

      {/* Preview */}
      {leader && (
        <div className="px-4 pb-4 pt-1 border-t border-dust-grey">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 uppercase">Leader</span>
            {leader.isWinner && <WinnerBadge />}
          </div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-medium text-gunmetal">{leader.name}</span>
              {leader.subtitle && (
                <span className="text-sm text-gray-500 ml-2">{leader.subtitle}</span>
              )}
            </div>
            {leader.maxEdge !== null && Math.abs(leader.maxEdge) > 1 && (
              <EdgeBadge edge={leader.maxEdge} />
            )}
          </div>

          {/* Show consensus estimate when we have leader odds data */}
          {leaderConsensus !== null && leader.odds.length >= 2 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-pine-blue font-semibold w-20">Estimate</span>
                <div className="flex-1">
                  <ConsensusBar probability={leaderConsensus} />
                </div>
              </div>
            </div>
          ) : leader.polymarketOdds !== null ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-20">Polymarket</span>
              <div className="flex-1">
                <OddsBar probability={leader.polymarketOdds} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Link>
  );
}
