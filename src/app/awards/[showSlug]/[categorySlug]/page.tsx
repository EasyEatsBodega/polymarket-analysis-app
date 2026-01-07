"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  polymarketUrl: string | null;
  isClosed: boolean;
  leader: NomineeData | null;
  nominees: NomineeData[];
}

interface ShowData {
  id: string;
  name: string;
  slug: string;
  ceremonyDate: string;
  status: string;
  categories: CategoryData[];
}

// Source display names and colors
const SOURCE_CONFIG: Record<string, { name: string; color: string; bgColor: string }> = {
  POLYMARKET: { name: "Polymarket", color: "text-purple-600", bgColor: "bg-purple-500" },
  MYBOOKIE: { name: "MyBookie", color: "text-blue-600", bgColor: "bg-blue-500" },
  DRAFTKINGS: { name: "DraftKings", color: "text-green-600", bgColor: "bg-green-500" },
  BETMGM: { name: "BetMGM", color: "text-yellow-600", bgColor: "bg-yellow-500" },
  BOVADA: { name: "Bovada", color: "text-red-600", bgColor: "bg-red-500" },
  GOLDDERBY: { name: "Gold Derby", color: "text-amber-600", bgColor: "bg-amber-500" },
};

function OddsBar({ probability, color }: { probability: number; color: string }) {
  const percentage = Math.round(probability * 100);
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-semibold min-w-[45px] text-right">
        {percentage}%
      </span>
    </div>
  );
}

function EdgeBadge({ edge, large = false }: { edge: number; large?: boolean }) {
  const isPositive = edge > 0;
  const sizeClass = large ? "text-lg px-3 py-1" : "text-sm px-2 py-0.5";
  const colorClass = isPositive
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`${sizeClass} ${colorClass} rounded-full font-semibold border`}>
      {isPositive ? "+" : ""}{edge.toFixed(1)}%
    </span>
  );
}

function NomineeRow({ nominee, rank }: { nominee: NomineeData; rank: number }) {
  const polymarket = nominee.odds.find(o => o.source === "POLYMARKET");
  const mybookie = nominee.odds.find(o => o.source === "MYBOOKIE");

  // Calculate edge
  const edge = polymarket && mybookie
    ? (mybookie.probability - polymarket.probability) * 100
    : null;

  return (
    <div className={`p-4 rounded-lg border ${nominee.isWinner ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-300">#{rank}</span>
          <div>
            <h3 className="font-semibold text-lg text-gunmetal">{nominee.name}</h3>
            {nominee.subtitle && (
              <p className="text-sm text-gray-500">{nominee.subtitle}</p>
            )}
          </div>
        </div>
        {nominee.isWinner && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L5.1 17l.9-5.3-4-3.9L7.5 7 10 2z" clipRule="evenodd" />
            </svg>
            Winner
          </span>
        )}
        {edge !== null && Math.abs(edge) > 1 && (
          <EdgeBadge edge={edge} large />
        )}
      </div>

      {/* Odds comparison bars */}
      <div className="space-y-2">
        {polymarket && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 w-20">Polymarket</span>
            <OddsBar probability={polymarket.probability} color="bg-purple-500" />
          </div>
        )}
        {mybookie && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 w-20">MyBookie</span>
            <OddsBar probability={mybookie.probability} color="bg-blue-500" />
          </div>
        )}
        {!polymarket && !mybookie && (
          <p className="text-sm text-gray-400 italic">No odds available</p>
        )}
      </div>

      {/* Trade links */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        {polymarket?.url && (
          <a
            href={polymarket.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            Trade on Polymarket →
          </a>
        )}
        {mybookie?.url && (
          <a
            href={mybookie.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Bet on MyBookie →
          </a>
        )}
      </div>
    </div>
  );
}

function EdgeHighlights({ nominees }: { nominees: NomineeData[] }) {
  // Find nominees with significant edges
  const edgeNominees = nominees
    .map(n => {
      const pm = n.odds.find(o => o.source === "POLYMARKET");
      const mb = n.odds.find(o => o.source === "MYBOOKIE");
      if (!pm || !mb) return null;
      const edge = (mb.probability - pm.probability) * 100;
      return { ...n, edge, pmOdds: pm.probability, mbOdds: mb.probability };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null && Math.abs(n.edge) > 2)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

  if (edgeNominees.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-pine-blue/10 to-old-gold/10 rounded-xl p-6 mb-6">
      <h2 className="text-lg font-bold text-gunmetal mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-old-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Edge Opportunities
      </h2>
      <div className="grid gap-3">
        {edgeNominees.slice(0, 3).map(n => (
          <div key={n.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gunmetal">{n.name}</p>
              <p className="text-sm text-gray-500">
                PM: {(n.pmOdds * 100).toFixed(0)}% → MB: {(n.mbOdds * 100).toFixed(0)}%
              </p>
            </div>
            <EdgeBadge edge={n.edge} large />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        {edgeNominees[0].edge > 0
          ? "Positive edge = MyBookie has higher odds (potential value on Polymarket NO)"
          : "Negative edge = Polymarket has higher odds (potential value on Polymarket YES)"}
      </p>
    </div>
  );
}

export default function CategoryDetailPage() {
  const params = useParams();
  const showSlug = params.showSlug as string;
  const categorySlug = params.categorySlug as string;

  const [show, setShow] = useState<ShowData | null>(null);
  const [category, setCategory] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/awards?show=${showSlug}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error || "Failed to load data");
          return;
        }

        const showData = json.data as ShowData;
        setShow(showData);

        const cat = showData.categories.find(c => c.slug === categorySlug);
        if (!cat) {
          setError("Category not found");
          return;
        }

        setCategory(cat);
      } catch (err) {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [showSlug, categorySlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pine-blue"></div>
      </div>
    );
  }

  if (error || !show || !category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Category not found"}</p>
          <Link href="/awards" className="text-pine-blue hover:underline">
            ← Back to Awards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gunmetal text-white">
        <div className="container mx-auto px-4 py-6">
          <Link
            href={`/awards?show=${showSlug}`}
            className="inline-flex items-center gap-2 text-dust-grey hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {show.name}
          </Link>
          <h1 className="text-3xl font-bold mb-2">{category.name}</h1>
          <div className="flex items-center gap-4 text-sm text-dust-grey">
            <span>{show.name}</span>
            <span>•</span>
            <span>{new Date(show.ceremonyDate).toLocaleDateString()}</span>
            {category.isClosed && (
              <>
                <span>•</span>
                <span className="text-amber-400">Resolved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Edge Highlights */}
        <EdgeHighlights nominees={category.nominees} />

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-500"></div>
            <span className="text-sm text-gray-600">Polymarket</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500"></div>
            <span className="text-sm text-gray-600">MyBookie</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">
              {category.nominees.length} nominees
            </span>
          </div>
        </div>

        {/* Nominees Grid */}
        <div className="grid gap-4">
          {category.nominees.map((nominee, index) => (
            <NomineeRow key={nominee.id} nominee={nominee} rank={index + 1} />
          ))}
        </div>

        {/* Trade CTA */}
        {category.polymarketUrl && (
          <div className="mt-8 text-center">
            <a
              href={category.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Trade this Market on Polymarket
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
