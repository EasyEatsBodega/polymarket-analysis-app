"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import CategoryCard from "@/components/awards/CategoryCard";

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

interface AwardsApiResponse {
  success: boolean;
  data: ShowData | ShowData[];
  meta: {
    totalShows: number;
    totalCategories: number;
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    UPCOMING: { bg: "bg-blue-100", text: "text-blue-700", label: "Upcoming" },
    ACTIVE: { bg: "bg-green-100", text: "text-green-700", label: "Markets Open" },
    COMPLETED: { bg: "bg-gray-200", text: "text-gray-600", label: "Completed" },
  };

  const c = config[status] || config.UPCOMING;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ShowHeader({ show }: { show: ShowData }) {
  const openCategories = show.categories.filter((c) => !c.isClosed).length;
  const totalCategories = show.categories.length;

  return (
    <div className="bg-gunmetal text-white py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold">{show.name}</h1>
              <StatusBadge status={show.status} />
            </div>
            <p className="text-dust-grey text-lg">{formatDate(show.ceremonyDate)}</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-3xl font-bold">{openCategories}</div>
              <div className="text-sm text-dust-grey">Open Markets</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{totalCategories}</div>
              <div className="text-sm text-dust-grey">Total Categories</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-dust-grey rounded-lg p-4 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="h-2 bg-gray-200 rounded w-full" />
        </div>
      ))}
    </div>
  );
}

export default function AwardsPage() {
  const [shows, setShows] = useState<ShowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAwards() {
      try {
        const res = await fetch("/api/awards");
        const json: AwardsApiResponse = await res.json();

        if (!json.success) {
          throw new Error(json.data ? "Failed to load awards" : "Unknown error");
        }

        // Normalize to array
        const showsData = Array.isArray(json.data) ? json.data : [json.data];
        setShows(showsData);
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

      {loading ? (
        <>
          <div className="bg-gunmetal text-white py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="animate-pulse">
                <div className="h-10 bg-gray-700 rounded w-1/3 mb-4" />
                <div className="h-6 bg-gray-700 rounded w-1/4" />
              </div>
            </div>
          </div>
          <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <LoadingSkeleton />
          </main>
        </>
      ) : error ? (
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </main>
      ) : shows.length === 0 ? (
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white border border-dust-grey rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gunmetal mb-2">No Award Shows Found</h2>
            <p className="text-gray-500">Check back later for upcoming award show predictions.</p>
          </div>
        </main>
      ) : (
        <>
          {shows.map((show) => (
            <div key={show.id}>
              <ShowHeader show={show} />
              <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Open Markets Section */}
                {show.categories.some((c) => !c.isClosed) && (
                  <section className="mb-8">
                    <h2 className="text-lg font-semibold text-gunmetal mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      Open Markets
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {show.categories
                        .filter((c) => !c.isClosed)
                        .map((category) => (
                          <CategoryCard
                            key={category.id}
                            name={category.name}
                            slug={category.slug}
                            showSlug={show.slug}
                            polymarketUrl={category.polymarketUrl}
                            isClosed={category.isClosed}
                            leader={category.leader}
                            nominees={category.nominees}
                          />
                        ))}
                    </div>
                  </section>
                )}

              </main>
            </div>
          ))}
        </>
      )}

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
