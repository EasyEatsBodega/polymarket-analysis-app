"use client";

import { useState } from "react";

type Tab = "global-shows" | "global-movies" | "us-shows" | "us-movies";

const tabs: { id: Tab; label: string }[] = [
  { id: "global-shows", label: "Global Shows" },
  { id: "global-movies", label: "Global Movies" },
  { id: "us-shows", label: "US Shows" },
  { id: "us-movies", label: "US Movies" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("global-shows");

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-dust-grey">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gunmetal">PredictEasy</h1>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search titles..."
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-dust-grey">
          <nav className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {/* Movers Table Placeholder */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">
              Top Movers - {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
              <p className="text-gray-500">
                Movers table will be displayed here once data is ingested.
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Shows titles ranked by MomentumScore with forecast bands.
              </p>
            </div>
          </section>

          {/* Breakouts Section Placeholder */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">
              Breakout Titles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="border border-dust-grey rounded-lg p-4 bg-white"
                >
                  <div className="h-24 bg-dust-grey bg-opacity-30 rounded flex items-center justify-center">
                    <span className="text-gray-400">Breakout Card {i}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Polymarket Comparison Placeholder */}
          <section>
            <h2 className="text-xl font-semibold text-gunmetal mb-4">
              Polymarket Signals
            </h2>
            <div className="bg-pine-blue bg-opacity-10 rounded-lg p-8 text-center border border-pine-blue border-opacity-30">
              <p className="text-pine-blue font-medium">
                Polymarket comparison data will appear here.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Side-by-side forecast vs market prices for Netflix-related markets.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dust-grey mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            PredictEasy - Netflix Intelligence Dashboard
          </p>
        </div>
      </footer>
    </div>
  );
}
