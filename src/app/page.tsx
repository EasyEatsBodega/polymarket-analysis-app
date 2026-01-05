"use client";

import { useState } from "react";
import MoversTable from "@/components/MoversTable";
import BreakoutGrid from "@/components/BreakoutCard";
import PolymarketComparison from "@/components/PolymarketComparison";

type Tab = "global-shows" | "global-movies" | "us-shows" | "us-movies";

const tabs: { id: Tab; label: string; type: "SHOW" | "MOVIE"; geo: "GLOBAL" | "US" }[] = [
  { id: "global-shows", label: "Global Shows", type: "SHOW", geo: "GLOBAL" },
  { id: "global-movies", label: "Global Movies", type: "MOVIE", geo: "GLOBAL" },
  { id: "us-shows", label: "US Shows", type: "SHOW", geo: "US" },
  { id: "us-movies", label: "US Movies", type: "MOVIE", geo: "US" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("global-shows");
  const [searchQuery, setSearchQuery] = useState("");

  const activeTabConfig = tabs.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-dust-grey">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gunmetal">PredictEasy</h1>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search titles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-dust-grey rounded-lg focus:outline-none focus:ring-2 focus:ring-pine-blue"
              />
              <button className="px-4 py-2 bg-old-gold text-gunmetal font-medium rounded-lg hover:bg-opacity-90 transition-colors">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* Tabs */}
        <div className="border-b border-dust-grey">
          <nav className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? "border-old-gold text-gunmetal"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {/* Movers Table */}
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gunmetal">
                Top Movers - {activeTabConfig.label}
              </h2>
              <span className="text-sm text-gray-500">
                Ranked by Momentum Score
              </span>
            </div>
            <MoversTable
              type={activeTabConfig.type}
              geo={activeTabConfig.geo}
              limit={10}
            />
          </section>

          {/* Breakouts Section */}
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gunmetal">
                Breakout Titles
              </h2>
              <span className="text-sm text-gray-500">
                High momentum + positive acceleration
              </span>
            </div>
            <BreakoutGrid type={activeTabConfig.type} limit={6} />
          </section>

          {/* Polymarket Comparison */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gunmetal">
                Polymarket Signals
              </h2>
              <span className="text-sm text-gray-500">
                Model vs Market Comparison
              </span>
            </div>
            <PolymarketComparison />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dust-grey mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            PredictEasy - Polymarket Intelligence Platform
          </p>
        </div>
      </footer>
    </div>
  );
}
