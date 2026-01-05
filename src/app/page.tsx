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
    id: "sports",
    title: "Sports",
    description: "NFL, NBA, MLB predictions and betting market analysis.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
      </svg>
    ),
  },
  {
    id: "politics",
    title: "Politics",
    description: "Election predictions and political event markets.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: "crypto",
    title: "Crypto",
    description: "Cryptocurrency price predictions and market trends.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

        {/* Active Markets */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

        {/* Coming Soon */}
        <div className="bg-gray-50 py-12">
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
