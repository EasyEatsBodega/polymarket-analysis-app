"use client";

import { useState } from "react";
import MoversTable from "@/components/MoversTable";
import BreakoutGrid from "@/components/BreakoutCard";
import PolymarketComparison from "@/components/PolymarketComparison";
import Header from "@/components/Header";

type Tab = "shows-english" | "shows-non-english" | "films-english" | "films-non-english";

const tabs: { id: Tab; label: string; type: "SHOW" | "MOVIE"; geo: "GLOBAL" | "US"; language: "english" | "non-english" }[] = [
  { id: "shows-english", label: "TV (English)", type: "SHOW", geo: "GLOBAL", language: "english" },
  { id: "shows-non-english", label: "TV (Non-English)", type: "SHOW", geo: "GLOBAL", language: "non-english" },
  { id: "films-english", label: "Films (English)", type: "MOVIE", geo: "GLOBAL", language: "english" },
  { id: "films-non-english", label: "Films (Non-English)", type: "MOVIE", geo: "GLOBAL", language: "non-english" },
];

export default function NetflixPage() {
  const [activeTab, setActiveTab] = useState<Tab>("shows-english");
  const [searchQuery, setSearchQuery] = useState("");

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
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gunmetal">
                Top Movers - {activeTabConfig.label}
              </h2>
              <span className="text-sm text-gray-500">
                Sorted by Rank
              </span>
            </div>
            <MoversTable
              type={activeTabConfig.type}
              geo={activeTabConfig.geo}
              language={activeTabConfig.language}
              limit={10}
            />
          </section>

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
