"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

interface ShowSummary {
  id: string;
  name: string;
  slug: string;
  ceremonyDate: string;
  status: string;
  openMarkets: number;
  totalCategories: number;
  topCategory?: {
    name: string;
    leaderName: string;
    leaderOdds: number;
  };
}

interface AwardsApiResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    slug: string;
    ceremonyDate: string;
    status: string;
    categories: Array<{
      id: string;
      name: string;
      isClosed: boolean;
      leader?: {
        name: string;
        polymarketOdds: number | null;
      } | null;
    }>;
  }[];
  meta: {
    totalShows: number;
    fetchedAt: string;
  };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDaysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status, daysUntil }: { status: string; daysUntil: number }) {
  if (status === "COMPLETED") {
    return (
      <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-600">
        Completed
      </span>
    );
  }

  if (daysUntil <= 7) {
    return (
      <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
        {daysUntil} days left
      </span>
    );
  }

  if (daysUntil <= 30) {
    return (
      <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">
        {daysUntil} days left
      </span>
    );
  }

  return (
    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
      Markets Open
    </span>
  );
}

function AwardShowCard({ show }: { show: ShowSummary }) {
  const daysUntil = getDaysUntil(show.ceremonyDate);

  return (
    <Link href={`/awards/${show.slug}`}>
      <div className="bg-white border border-dust-grey rounded-xl p-6 hover:shadow-lg hover:border-pine-blue transition-all cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gunmetal group-hover:text-pine-blue transition-colors">
              {show.name}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(show.ceremonyDate)}
            </p>
          </div>
          <StatusBadge status={show.status} daysUntil={daysUntil} />
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-4">
          <div>
            <div className="text-2xl font-bold text-pine-blue">{show.openMarkets}</div>
            <div className="text-xs text-gray-500">Open Markets</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-700">{show.totalCategories}</div>
            <div className="text-xs text-gray-500">Categories</div>
          </div>
        </div>

        {/* Featured Category */}
        {show.topCategory && (
          <div className="bg-gray-50 rounded-lg p-3 mt-auto">
            <p className="text-xs text-gray-500 mb-1">Featured: {show.topCategory.name}</p>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gunmetal text-sm truncate max-w-[60%]">
                {show.topCategory.leaderName}
              </span>
              <span className="text-pine-blue font-bold text-sm">
                {Math.round(show.topCategory.leaderOdds * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex items-center justify-end text-sm text-pine-blue font-medium group-hover:translate-x-1 transition-transform">
          View Predictions
          <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-dust-grey rounded-xl p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
          <div className="flex gap-6 mb-4">
            <div className="h-8 bg-gray-200 rounded w-12" />
            <div className="h-8 bg-gray-200 rounded w-12" />
          </div>
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function AwardsLandingPage() {
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAwards() {
      try {
        const res = await fetch("/api/awards");
        const json: AwardsApiResponse = await res.json();

        if (!json.success) {
          throw new Error("Failed to load awards");
        }

        // Transform to summary format
        const showsData = Array.isArray(json.data) ? json.data : [json.data];
        const summaries: ShowSummary[] = showsData.map(show => {
          const openCategories = show.categories.filter(c => !c.isClosed);
          const topCategory = openCategories.find(c => c.leader?.polymarketOdds);

          return {
            id: show.id,
            name: show.name,
            slug: show.slug,
            ceremonyDate: show.ceremonyDate,
            status: show.status,
            openMarkets: openCategories.length,
            totalCategories: show.categories.length,
            topCategory: topCategory && topCategory.leader ? {
              name: topCategory.name,
              leaderName: topCategory.leader.name,
              leaderOdds: topCategory.leader.polymarketOdds || 0,
            } : undefined,
          };
        });

        setShows(summaries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load awards");
      } finally {
        setLoading(false);
      }
    }

    fetchAwards();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      {/* Hero Section */}
      <div className="bg-gunmetal text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Awards Intelligence Hub</h1>
          <p className="text-dust-grey text-lg">
            Track predictions, odds, and expert analysis for major award shows
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        ) : shows.length === 0 ? (
          <div className="bg-white border border-dust-grey rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gunmetal mb-2">No Award Shows Found</h2>
            <p className="text-gray-500">Check back later for upcoming award show predictions.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gunmetal mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Active Award Shows
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shows.map((show) => (
                <AwardShowCard key={show.id} show={show} />
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-dust-grey bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            PredictEasy - Awards Intelligence Hub
          </p>
        </div>
      </footer>
    </div>
  );
}
