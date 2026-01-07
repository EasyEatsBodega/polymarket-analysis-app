"use client";

import { useState } from "react";

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
  polymarketUrl,
  isClosed,
  leader,
  nominees,
}: CategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`bg-white border border-dust-grey rounded-lg shadow-sm overflow-hidden ${isClosed ? "opacity-70" : ""}`}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gunmetal text-left">{name}</h3>
          {isClosed && <ClosedBadge />}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed preview */}
      {!isExpanded && leader && (
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
          </div>
          {leader.polymarketOdds !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-20">Polymarket</span>
                <div className="flex-1">
                  <OddsBar probability={leader.polymarketOdds} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-dust-grey">
          {/* All nominees table */}
          <div className="p-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">All Nominees</h4>
            <div className="space-y-3">
              {nominees.map((nominee) => (
                <div key={nominee.id} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gunmetal">{nominee.name}</span>
                      {nominee.isWinner && <WinnerBadge />}
                    </div>
                    {nominee.subtitle && (
                      <span className="text-sm text-gray-500">{nominee.subtitle}</span>
                    )}
                    {nominee.polymarketOdds !== null && (
                      <div className="mt-1">
                        <OddsBar probability={nominee.polymarketOdds} />
                      </div>
                    )}
                  </div>
                  {nominee.maxEdge !== null && (
                    <div className="text-right">
                      <EdgeBadge edge={nominee.maxEdge} />
                      {nominee.edgeSource && (
                        <div className="text-[10px] text-gray-400">{nominee.edgeSource}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer with link */}
          {polymarketUrl && (
            <div className="px-4 py-3 bg-gray-50 border-t border-dust-grey flex justify-end">
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-pine-blue hover:text-pine-blue/80 font-medium"
              >
                Trade on Polymarket
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
