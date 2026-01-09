"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  data: ShowData;
  error?: string;
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

function ShowHeader({ show }: { show: ShowData }) {
  const openCategories = show.categories.filter((c) => !c.isClosed).length;
  const totalCategories = show.categories.length;

  return (
    <div className="bg-gunmetal text-white py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link
          href="/awards"
          className="inline-flex items-center gap-2 text-dust-grey hover:text-white mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Award Shows
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{show.name}</h1>
            <p className="text-dust-grey text-lg mt-1">{formatDate(show.ceremonyDate)}</p>
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
    <>
      <div className="bg-gunmetal text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-24 mb-4" />
            <div className="h-10 bg-gray-700 rounded w-1/3 mb-4" />
            <div className="h-6 bg-gray-700 rounded w-1/4" />
          </div>
        </div>
      </div>
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-dust-grey rounded-lg p-4 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-2 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

export default function ShowDetailPage() {
  const params = useParams();
  const showSlug = params.showSlug as string;

  const [show, setShow] = useState<ShowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchShow() {
      try {
        const res = await fetch(`/api/awards?show=${showSlug}`);
        const json: AwardsApiResponse = await res.json();

        if (!json.success) {
          throw new Error(json.error || "Failed to load show");
        }

        setShow(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load show");
      } finally {
        setLoading(false);
      }
    }

    fetchShow();
  }, [showSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !show) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600 mb-4">{error || "Show not found"}</p>
            <Link
              href="/awards"
              className="inline-flex items-center gap-2 px-4 py-2 bg-pine-blue text-white rounded-lg hover:bg-opacity-90"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Award Shows
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const openCategories = show.categories.filter((c) => !c.isClosed);
  const closedCategories = show.categories.filter((c) => c.isClosed);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <ShowHeader show={show} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Open Markets Section */}
        {openCategories.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gunmetal mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Open Markets
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {openCategories.map((category) => (
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

        {/* Resolved Markets Section */}
        {closedCategories.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gunmetal mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full" />
              Resolved Markets
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {closedCategories.map((category) => (
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

        {/* Empty State */}
        {show.categories.length === 0 && (
          <div className="bg-white border border-dust-grey rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gunmetal mb-2">No Categories Yet</h2>
            <p className="text-gray-500">Categories will appear here once nominations are announced.</p>
          </div>
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
