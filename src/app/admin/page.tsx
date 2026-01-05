"use client";

import { useUser } from "@clerk/nextjs";

export default function AdminPage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gunmetal">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <JobCard
          title="Netflix Data Ingestion"
          description="Import latest Netflix Top 10 weekly data"
          endpoint="/api/jobs/ingest-netflix"
        />
        <JobCard
          title="Daily Signals"
          description="Fetch Google Trends and Wikipedia data"
          endpoint="/api/jobs/ingest-signals"
        />
        <JobCard
          title="Generate Forecasts"
          description="Run forecast model on latest data"
          endpoint="/api/jobs/generate-forecasts"
        />
        <JobCard
          title="Polymarket Sync"
          description="Discover and sync market data"
          endpoint="/api/jobs/sync-polymarket"
        />
        <JobCard
          title="Pacing Metrics"
          description="Fetch pacing signals for watchlist titles"
          endpoint="/api/jobs/ingest-pacing"
        />
      </div>

      {/* Admin Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-dust-grey rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Configuration</h2>
          <p className="text-gray-600 mb-4">
            Adjust momentum score weights, breakout thresholds, and other settings.
          </p>
          <a
            href="/admin/settings"
            className="inline-block bg-pine-blue text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
          >
            Open Settings
          </a>
        </div>

        <div className="bg-white border border-dust-grey rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Job History</h2>
          <p className="text-gray-600 mb-4">
            View past job runs, their status, and detailed results.
          </p>
          <a
            href="/admin/jobs"
            className="inline-block bg-old-gold text-gunmetal px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors font-medium"
          >
            View History
          </a>
        </div>

        <div className="bg-white border border-dust-grey rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Release Watchlist</h2>
          <p className="text-gray-600 mb-4">
            Manage upcoming Netflix releases and track pacing signals.
          </p>
          <a
            href="/admin/releases"
            className="inline-block bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors font-medium"
          >
            Manage Releases
          </a>
        </div>
      </div>
    </div>
  );
}

function JobCard({
  title,
  description,
  endpoint,
}: {
  title: string;
  description: string;
  endpoint: string;
}) {
  const handleTrigger = async () => {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
      });
      const data = await response.json();
      if (data.success) {
        alert("Check console for details");
      } else {
        alert("Check console for details");
      }
    } catch (_err) {
      alert("Check console for details");
    }
  };

  return (
    <div className="bg-white border border-dust-grey rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gunmetal mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-4">{description}</p>
      <button
        onClick={handleTrigger}
        className="bg-old-gold text-gunmetal px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors font-medium"
      >
        Run Job
      </button>
    </div>
  );
}
