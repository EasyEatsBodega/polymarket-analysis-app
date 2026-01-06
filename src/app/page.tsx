"use client";

import Link from "next/link";
import Header from "@/components/Header";

const markets = [
  {
    id: "netflix",
    title: "Netflix",
    description: "Track Netflix Top 10 rankings, viewership trends, and momentum scores for TV shows and films.",
    icon: (
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z" />
      </svg>
    ),
    href: "/netflix",
    color: "bg-red-600",
    hoverColor: "hover:bg-red-700",
  },
];

const comingSoon = [
  {
    id: "movies",
    title: "Movies",
    description: "Total Grossing Forecasts and Rotten Tomato scores.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
  },
  {
    id: "awards",
    title: "Award Shows",
    description: "Who Will Win What Based on Data and Forecasts.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <div className="bg-gunmetal text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Make Prediction Trading Easier
            </h1>
            <p className="text-xl text-dust-grey max-w-2xl mx-auto">
              Data-driven insights and analytics to help you make smarter predictions on Polymarket and other prediction markets.
            </p>
          </div>
        </div>

        {/* Insider Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-gunmetal mb-8">Insider</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/insider-finder"
              className="group block p-6 bg-white border border-dust-grey rounded-xl shadow-sm hover:shadow-md transition-all"
            >
              <div className="w-14 h-14 bg-purple-600 group-hover:bg-purple-700 text-white rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gunmetal mb-2">
                Insider Finder
              </h3>
              <p className="text-gray-600">
                Detect potential insider trading patterns on Polymarket. Find new wallets with suspicious trading behavior and high win rates.
              </p>
              <div className="mt-4 text-pine-blue font-medium flex items-center gap-2">
                Explore
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>

        {/* Active Markets */}
        <div className="bg-gray-50 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gunmetal mb-8">Markets</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.map((market) => (
                <Link
                  key={market.id}
                  href={market.href}
                  className="group block p-6 bg-white border border-dust-grey rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  <div className={`w-14 h-14 ${market.color} ${market.hoverColor} text-white rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                    {market.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gunmetal mb-2">
                    {market.title}
                  </h3>
                  <p className="text-gray-600">
                    {market.description}
                  </p>
                  <div className="mt-4 text-pine-blue font-medium flex items-center gap-2">
                    Explore
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gunmetal mb-8">Coming Soon</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {comingSoon.map((market) => (
                <div
                  key={market.id}
                  className="p-6 bg-white border border-dust-grey rounded-xl opacity-60"
                >
                  <div className="w-14 h-14 bg-gray-300 text-gray-500 rounded-lg flex items-center justify-center mb-4">
                    {market.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gunmetal mb-2">
                    {market.title}
                  </h3>
                  <p className="text-gray-600">
                    {market.description}
                  </p>
                  <div className="mt-4 text-gray-400 font-medium">
                    Coming Soon
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-dust-grey">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            PredictEasy - Make Prediction Trading Easier
          </p>
        </div>
      </footer>
    </div>
  );
}
