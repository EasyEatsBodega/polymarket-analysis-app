"use client";

import { useState } from "react";
import PolymarketMarkets from "@/components/PolymarketMarkets";
import Header from "@/components/Header";
import OpportunityGrid from "@/components/OpportunityGrid";
import FlixPatrolRankChart from "@/components/FlixPatrolRankChart";

type Tab = "shows-us" | "shows-global" | "films-us" | "films-global";
type ViewMode = "rankings" | "opportunities";

const tabs: { id: Tab; label: string; type: "SHOW" | "MOVIE"; region: "us" | "global" }[] = [
  { id: "shows-us", label: "TV (US)", type: "SHOW", region: "us" },
  { id: "shows-global", label: "TV (Global)", type: "SHOW", region: "global" },
  { id: "films-us", label: "Films (US)", type: "MOVIE", region: "us" },
  { id: "films-global", label: "Films (Global)", type: "MOVIE", region: "global" },
];

export default function NetflixPage() {
  const [activeTab, setActiveTab] = useState<Tab>("shows-us");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("rankings");
  const [minEdge, setMinEdge] = useState(10);

  const activeTabConfig = tabs.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <div className="border-b border-dust-grey bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <input
            type="text"
            placeholder="Search titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-dust-grey rounded-lg focus:outline-none focus:ring-2 focus:ring-pine-blue"
          />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="border-b border-dust-grey">
          <nav className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? "pb-4 px-1 border-b-2 font-medium text-sm transition-colors border-old-gold text-gunmetal" : "pb-4 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8">
          {/* Polymarket Signals - THE market we're comparing against */}
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gunmetal">
                  Polymarket Odds - {activeTabConfig.label}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Live prediction market prices
                </p>
              </div>
            </div>
            <PolymarketMarkets tab={activeTab} />
          </section>

          {/* Our Model's Analysis */}
          <section className="mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gunmetal">
                  PredictEasy Analysis - {activeTabConfig.label}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Our model estimates vs market odds
                </p>
              </div>

              {/* View mode tabs */}
              <div className="flex items-center gap-4">
                <div className="flex rounded-lg border border-dust-grey overflow-hidden">
                  <button
                    onClick={() => setViewMode("rankings")}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      viewMode === "rankings"
                        ? "bg-pine-blue text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    All Titles
                  </button>
                  <button
                    onClick={() => setViewMode("opportunities")}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      viewMode === "opportunities"
                        ? "bg-pine-blue text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Opportunities
                  </button>
                </div>

                {/* Min edge filter (only show for opportunities view) */}
                {viewMode === "opportunities" && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500">Min edge:</label>
                    <select
                      value={minEdge}
                      onChange={(e) => setMinEdge(parseInt(e.target.value))}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-pine-blue"
                    >
                      <option value="5">5%</option>
                      <option value="10">10%</option>
                      <option value="15">15%</option>
                      <option value="20">20%</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Opportunity Grid - Only Polymarket titles */}
            <OpportunityGrid
              type={activeTabConfig.type}
              category={activeTab}
              minEdge={viewMode === "opportunities" ? minEdge : 0}
              showOnlyOpportunities={viewMode === "opportunities"}
              polymarketOnly={true}
              limit={viewMode === "opportunities" ? 20 : 15}
              compact={false}
            />
          </section>

          {/* FlixPatrol Daily Rankings Chart */}
          <section className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gunmetal">
                FlixPatrol Daily Rankings - {activeTabConfig.type === "SHOW" ? "TV" : "Films"} (Worldwide)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                14-day rank trends for Polymarket-linked titles
              </p>
            </div>
            <FlixPatrolRankChart
              type={activeTabConfig.type}
              region="world"
              polymarketOnly={true}
              days={14}
            />
          </section>
        </div>
      </main>

      <footer className="border-t border-dust-grey mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            PredictEasy - Make Prediction Trading Easier
          </p>
        </div>
      </footer>
    </div>
  );
}
