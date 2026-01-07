"use client";

import Link from "next/link";

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

  return (
    <Link
      href={`/awards/${showSlug}/${slug}`}
      className={`block bg-white border rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-pine-blue/50 ${
        isClosed ? "opacity-70 border-dust-grey" : hasSignificantEdge ? "border-old-gold" : "border-dust-grey"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gunmetal">{name}</h3>
          {isClosed && <ClosedBadge />}
          {hasSignificantEdge && !isClosed && (
            <span className="px-2 py-0.5 bg-old-gold/20 text-old-gold rounded text-xs font-medium">
              Edge
            </span>
          )}
        </div>
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

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
          {leader.polymarketOdds !== null && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-20">Polymarket</span>
              <div className="flex-1">
                <OddsBar probability={leader.polymarketOdds} />
              </div>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
