"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { MarketThesis } from "@/components/netflix/MarketThesis";
import { TitleRatings } from "@/components/netflix/TitleRatings";

interface RankData {
  week: string;
  rank: number;
  views: number | null;
  category: string;
}

interface SignalData {
  date: string;
  value: number;
}

interface MarketData {
  id: string;
  slug: string;
  question: string;
  outcomes: string[];
  endDate: string | null;
  resolved: boolean;
  latestPrices: number[] | null;
}

interface ForecastData {
  weekStart: string;
  weekEnd: string;
  target: string;
  p10: number;
  p50: number;
  p90: number;
  momentumScore?: number;
  confidence?: string;
}

interface TrailerHistoryPoint {
  date: string;
  views: number;
  likes: number;
  dislikes: number;
  engagementRatio: number;
}

interface TrailerData {
  fpTrailerId: string;
  title: string;
  premiereDate: string | null;
  current: {
    views: number;
    likes: number;
    dislikes: number;
    engagementRatio: number;
  };
  changes: {
    views: number;
    likes: number;
  };
  history: TrailerHistoryPoint[];
}

interface SocialHistoryPoint {
  date: string;
  followers: number;
  change: number;
}

interface SocialData {
  platform: string;
  current: {
    followers: number;
    change: number;
  };
  growthPercent: number;
  followersChange: number;
  history: SocialHistoryPoint[];
}

interface FlixPatrolData {
  trailers: TrailerData[];
  social: SocialData[];
}

interface RatingsData {
  imdbId: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  rtCriticScore: number | null;
  metascore: number | null;
  rated: string | null;
}

interface TitleData {
  id: string;
  canonicalName: string;
  type: "SHOW" | "MOVIE";
  tmdbId: string | null;
  aliases: string[];
  ratings: RatingsData | null;
  rankings: {
    global: RankData[];
    us: RankData[];
  };
  signals: {
    trends: SignalData[];
    wikipedia: SignalData[];
  };
  forecasts: ForecastData[];
  markets: MarketData[];
  flixpatrol: FlixPatrolData;
}

// Helper to format numbers
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Trend indicator component
function TrendIndicator({
  current,
  previous,
  inverse = false,
  showPercent = true,
  size = "md"
}: {
  current: number;
  previous: number | null;
  inverse?: boolean;
  showPercent?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  if (previous === null || previous === current) return null;

  const change = current - previous;
  const percentChange = previous !== 0 ? ((change / previous) * 100) : 0;
  const isPositive = inverse ? change < 0 : change > 0;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <span className={`inline-flex items-center gap-1 font-medium ${sizeClasses[size]} ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {showPercent ? `${Math.abs(percentChange).toFixed(1)}%` : Math.abs(change)}
    </span>
  );
}

// Sparkline component for inline trend visualization
function Sparkline({
  data,
  color = "bg-blue-500",
  height = 32,
  showTrend = true
}: {
  data: number[];
  color?: string;
  height?: number;
  showTrend?: boolean;
}) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  // Determine overall trend
  const trend = data[data.length - 1] - data[0];
  const trendColor = trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-px" style={{ height }}>
        {data.slice(-12).map((value, i) => {
          const h = ((value - min) / range) * 100;
          const isLatest = i === data.slice(-12).length - 1;
          return (
            <div
              key={i}
              className={`w-1.5 rounded-sm transition-all ${isLatest ? color : 'bg-gray-300'}`}
              style={{ height: `${Math.max(h, 10)}%` }}
            />
          );
        })}
      </div>
      {showTrend && (
        <span className={`${trendColor}`}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
        </span>
      )}
    </div>
  );
}

// Enhanced Rankings & Forecast Section
function RankingsSection({
  rankings,
  forecasts,
  region
}: {
  rankings: RankData[];
  forecasts: ForecastData[];
  region: "global" | "us";
}) {
  const sorted = [...rankings].sort((a, b) =>
    new Date(a.week).getTime() - new Date(b.week).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const weekAgo = sorted[sorted.length - 2];
  const twoWeeksAgo = sorted[sorted.length - 3];
  const fourWeeksAgo = sorted[sorted.length - 5];

  // Get relevant forecast
  const forecast = forecasts.find(f => f.target === 'RANK');

  if (!latest) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gunmetal mb-2">
          {region === "global" ? "Global" : "US"} Rankings
        </h3>
        <p className="text-gray-400 text-sm">No ranking data available</p>
      </div>
    );
  }

  // Calculate week-over-week and month-over-month changes
  const weekChange = weekAgo ? weekAgo.rank - latest.rank : 0;
  const monthChange = fourWeeksAgo ? fourWeeksAgo.rank - latest.rank : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gunmetal">
            {region === "global" ? "Global" : "US"} Top 10
          </h3>
          <p className="text-sm text-gray-500">{latest.category}</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-gunmetal">#{latest.rank}</div>
          <div className="text-sm text-gray-500">Current Rank</div>
        </div>
      </div>

      {/* Trend summary */}
      <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">vs Last Week</div>
          <div className={`text-lg font-bold ${weekChange > 0 ? 'text-green-600' : weekChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {weekChange > 0 ? `+${weekChange}` : weekChange === 0 ? '—' : weekChange}
          </div>
        </div>
        <div className="text-center border-l border-r border-gray-200">
          <div className="text-xs text-gray-500 mb-1">vs 2 Weeks Ago</div>
          {twoWeeksAgo ? (
            <div className={`text-lg font-bold ${(twoWeeksAgo.rank - latest.rank) > 0 ? 'text-green-600' : (twoWeeksAgo.rank - latest.rank) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {(twoWeeksAgo.rank - latest.rank) > 0 ? `+${twoWeeksAgo.rank - latest.rank}` : (twoWeeksAgo.rank - latest.rank) === 0 ? '—' : twoWeeksAgo.rank - latest.rank}
            </div>
          ) : <div className="text-lg font-bold text-gray-400">—</div>}
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">vs Month Ago</div>
          <div className={`text-lg font-bold ${monthChange > 0 ? 'text-green-600' : monthChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {monthChange > 0 ? `+${monthChange}` : monthChange === 0 ? '—' : monthChange}
          </div>
        </div>
      </div>

      {/* Visual rank history */}
      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Rank History (8 weeks)</div>
        <div className="relative">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-xs text-gray-400">
            <span>#1</span>
            <span>#5</span>
            <span>#10</span>
          </div>

          {/* Chart */}
          <div className="ml-10 h-32 flex items-end gap-2">
            {sorted.slice(-8).map((d, i) => {
              const height = ((11 - d.rank) / 10) * 100;
              const isLatest = i === sorted.slice(-8).length - 1;
              const weekLabel = new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col items-center h-full justify-end">
                    <span className="text-xs font-bold text-gunmetal mb-1">#{d.rank}</span>
                    <div
                      className={`w-full max-w-[40px] rounded-t-md transition-all ${
                        isLatest ? 'bg-pine-blue' : 'bg-gray-300'
                      }`}
                      style={{ height: `${Math.max(height, 15)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 mt-2 truncate w-full text-center">
                    {weekLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Forecast section */}
      {forecast && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">Next Week Forecast</div>
            {forecast.confidence && (
              <span className={`text-xs px-2 py-1 rounded-full ${
                forecast.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
                forecast.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {forecast.confidence} confidence
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-pine-blue/10 to-transparent rounded-lg">
            <div className="text-center px-3">
              <div className="text-xs text-gray-500">Best Case</div>
              <div className="text-lg font-bold text-green-600">#{forecast.p10}</div>
            </div>
            <div className="text-center px-4 border-l border-r border-gray-200">
              <div className="text-xs text-gray-500">Expected</div>
              <div className="text-2xl font-bold text-gunmetal">#{forecast.p50}</div>
            </div>
            <div className="text-center px-3">
              <div className="text-xs text-gray-500">Worst Case</div>
              <div className="text-lg font-bold text-red-600">#{forecast.p90}</div>
            </div>

            {forecast.momentumScore !== undefined && (
              <div className="ml-auto text-right">
                <div className="text-xs text-gray-500">Momentum</div>
                <div className={`text-lg font-bold ${forecast.momentumScore > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {forecast.momentumScore > 0 ? '+' : ''}{forecast.momentumScore.toFixed(1)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced Interest Signal Card
function SignalCard({
  data,
  title,
  icon,
  color
}: {
  data: SignalData[];
  title: string;
  icon: React.ReactNode;
  color: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-lg font-semibold text-gunmetal">{title}</h3>
        </div>
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const yesterday = sorted[sorted.length - 2];
  const weekAgo = sorted[sorted.length - 8];
  const twoWeeksAgo = sorted[sorted.length - 15];

  const dayChange = yesterday ? ((latest.value - yesterday.value) / (yesterday.value || 1)) * 100 : 0;
  const weekChange = weekAgo ? ((latest.value - weekAgo.value) / (weekAgo.value || 1)) * 100 : 0;
  const twoWeekChange = twoWeeksAgo ? ((latest.value - twoWeeksAgo.value) / (twoWeeksAgo.value || 1)) * 100 : 0;

  // Determine overall trend
  const avgRecent = sorted.slice(-7).reduce((s, d) => s + d.value, 0) / 7;
  const avgPrior = sorted.slice(-14, -7).reduce((s, d) => s + d.value, 0) / Math.min(7, sorted.slice(-14, -7).length);
  const overallTrend = avgPrior > 0 ? ((avgRecent - avgPrior) / avgPrior) * 100 : 0;

  const max = Math.max(...sorted.map(d => d.value));
  const min = Math.min(...sorted.map(d => d.value));
  const range = max - min || 1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-semibold text-gunmetal">{title}</h3>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
          overallTrend > 5 ? 'bg-green-100 text-green-700' :
          overallTrend < -5 ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {overallTrend > 5 ? '↑ Trending Up' : overallTrend < -5 ? '↓ Trending Down' : '→ Stable'}
        </div>
      </div>

      {/* Current value */}
      <div className="flex items-end gap-4 mb-6">
        <div>
          <div className="text-4xl font-bold text-gunmetal">{latest.value.toLocaleString()}</div>
          <div className="text-sm text-gray-500">
            {new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>

        {/* Change indicators */}
        <div className="flex gap-4 ml-auto">
          <div className="text-center">
            <div className="text-xs text-gray-500">1 Day</div>
            <div className={`text-sm font-bold ${dayChange > 0 ? 'text-green-600' : dayChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {dayChange > 0 ? '+' : ''}{dayChange.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">7 Days</div>
            <div className={`text-sm font-bold ${weekChange > 0 ? 'text-green-600' : weekChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {weekChange > 0 ? '+' : ''}{weekChange.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">14 Days</div>
            <div className={`text-sm font-bold ${twoWeekChange > 0 ? 'text-green-600' : twoWeekChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {twoWeekChange > 0 ? '+' : ''}{twoWeekChange.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-24 flex items-end gap-1">
        {sorted.slice(-14).map((d, i) => {
          const height = ((d.value - min) / range) * 100;
          const isLatest = i === sorted.slice(-14).length - 1;
          const isUp = i > 0 && sorted.slice(-14)[i].value > sorted.slice(-14)[i - 1].value;

          return (
            <div
              key={i}
              className="flex-1 group relative"
            >
              <div
                className={`w-full rounded-t transition-all hover:opacity-80 ${
                  isLatest ? color : isUp ? 'bg-green-200' : 'bg-red-200'
                }`}
                style={{ height: `${Math.max(height, 8)}%` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gunmetal text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {d.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{new Date(sorted[Math.max(0, sorted.length - 14)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(sorted[sorted.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}

// Enhanced Trailer Card with trend visualization
function TrailerCard({ trailer }: { trailer: TrailerData }) {
  const viewsTrend = trailer.history.map(h => h.views);
  const likesTrend = trailer.history.map(h => h.likes);

  // Calculate daily change rate
  const dailyViewsChange = trailer.history.length > 1
    ? (trailer.history[trailer.history.length - 1].views - trailer.history[trailer.history.length - 2].views)
    : trailer.changes.views;

  const dailyViewsPercent = trailer.history.length > 1 && trailer.history[trailer.history.length - 2].views > 0
    ? ((dailyViewsChange / trailer.history[trailer.history.length - 2].views) * 100)
    : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gunmetal truncate" title={trailer.title}>
            {trailer.title}
          </h4>
          {trailer.premiereDate && (
            <p className="text-xs text-gray-400">
              Released {new Date(trailer.premiereDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
        <div className="ml-2 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
          YouTube
        </div>
      </div>

      {/* Main metric with trend */}
      <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <div className="text-2xl font-bold text-gunmetal">{formatNumber(trailer.current.views)}</div>
          <div className="text-xs text-gray-500">Total Views</div>
        </div>
        <div className="text-right">
          {dailyViewsChange !== 0 && (
            <div className={`text-lg font-bold ${dailyViewsChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {dailyViewsChange > 0 ? '+' : ''}{formatNumber(dailyViewsChange)}
            </div>
          )}
          <div className={`text-xs ${dailyViewsPercent > 0 ? 'text-green-600' : dailyViewsPercent < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {dailyViewsPercent > 0 ? '+' : ''}{dailyViewsPercent.toFixed(1)}% daily
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-sm font-bold text-gunmetal">{formatNumber(trailer.current.likes)}</div>
          <div className="text-xs text-gray-500">Likes</div>
          {trailer.changes.likes !== 0 && (
            <div className={`text-xs font-medium ${trailer.changes.likes > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trailer.changes.likes > 0 ? '+' : ''}{formatNumber(trailer.changes.likes)}
            </div>
          )}
        </div>
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-sm font-bold text-gunmetal">{trailer.current.engagementRatio}%</div>
          <div className="text-xs text-gray-500">Like Ratio</div>
        </div>
      </div>

      {/* Views trend chart */}
      {viewsTrend.length > 1 && (
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Views Trend</span>
            <Sparkline data={viewsTrend} color="bg-red-500" height={24} />
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced Social Card with trends
function SocialCard({ social }: { social: SocialData[] }) {
  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'facebook':
        return <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
      case 'twitter':
        return <svg className="w-5 h-5 text-sky-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
      case 'instagram':
        return <svg className="w-5 h-5 text-pink-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
      case 'reddit':
        return <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z"/></svg>;
      default:
        return <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    }
  };

  if (!social || social.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gunmetal mb-2">Social Following</h3>
        <p className="text-gray-400 text-sm">No social data available</p>
      </div>
    );
  }

  const totalFollowers = social.reduce((sum, s) => sum + s.current.followers, 0);
  const totalChange = social.reduce((sum, s) => sum + s.followersChange, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gunmetal">Social Following</h3>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
          totalChange > 0 ? 'bg-green-100 text-green-700' :
          totalChange < 0 ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {totalChange > 0 ? '↑' : totalChange < 0 ? '↓' : '→'} {formatNumber(Math.abs(totalChange))}
        </div>
      </div>

      <div className="text-center mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-3xl font-bold text-gunmetal">{formatNumber(totalFollowers)}</div>
        <div className="text-sm text-gray-500">Total Followers</div>
      </div>

      <div className="space-y-3">
        {social.map((s) => (
          <div key={s.platform} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              {getPlatformIcon(s.platform)}
              <span className="text-sm font-medium capitalize">{s.platform}</span>
            </div>
            <div className="flex items-center gap-3">
              <Sparkline data={s.history.map(h => h.followers)} color="bg-blue-500" height={20} showTrend={false} />
              <div className="text-right">
                <div className="font-semibold text-gunmetal">{formatNumber(s.current.followers)}</div>
                {s.followersChange !== 0 && (
                  <div className={`text-xs font-medium ${s.followersChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.followersChange > 0 ? '+' : ''}{formatNumber(s.followersChange)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Market Card
function MarketCard({ market }: { market: MarketData }) {
  const yesPrice = market.latestPrices?.[0];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gunmetal mb-2 line-clamp-2">{market.question}</h3>

      {market.resolved ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm">
          Resolved
        </span>
      ) : (
        <>
          {yesPrice !== undefined && (
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Yes</span>
                  <span className="font-semibold text-green-600">{(yesPrice * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${yesPrice * 100}%` }} />
                </div>
              </div>
            </div>
          )}
          <a
            href={`https://polymarket.com/event/${market.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Trade on Polymarket →
          </a>
        </>
      )}

      {market.endDate && (
        <p className="text-xs text-gray-400 mt-2">
          Ends: {new Date(market.endDate).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function TitleDetailPage() {
  const params = useParams();
  const titleId = params.titleId as string;

  const [title, setTitle] = useState<TitleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/titles/${titleId}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error || "Failed to load data");
          return;
        }

        setTitle(json.data);
      } catch (err) {
        setError("Failed to load title data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [titleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pine-blue"></div>
        </div>
      </div>
    );
  }

  if (error || !title) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-red-500 mb-4">{error || "Title not found"}</p>
          <Link href="/netflix" className="text-pine-blue hover:underline">
            ← Back to Netflix
          </Link>
        </div>
      </div>
    );
  }

  const latestRanking = title.rankings.global[0];
  const categoryLabel = latestRanking?.category || (title.type === 'SHOW' ? 'TV Series' : 'Film');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Hero Header */}
      <div className="bg-gunmetal text-white">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/netflix"
            className="inline-flex items-center gap-2 text-dust-grey hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Netflix
          </Link>
          <h1 className="text-3xl font-bold mb-2">{title.canonicalName}</h1>
          <div className="flex items-center gap-4 text-sm text-dust-grey">
            <span className={`px-2 py-1 rounded ${title.type === 'SHOW' ? 'bg-red-600' : 'bg-blue-600'} text-white`}>
              {title.type === 'SHOW' ? 'TV Series' : 'Film'}
            </span>
            <span>{categoryLabel}</span>
            {latestRanking && (
              <>
                <span>•</span>
                <span className="text-old-gold font-medium">
                  Currently #{latestRanking.rank} Global
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Market Analysis - Why This Price? */}
        <section className="mb-8">
          <MarketThesis titleId={title.id} titleName={title.canonicalName} />
        </section>

        {/* Critic Ratings */}
        {title.ratings && (
          <section className="mb-8">
            <TitleRatings ratings={title.ratings} />
          </section>
        )}

        {/* Rankings Section - Combined with Forecasts */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Rankings & Forecast</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingsSection
              rankings={title.rankings.global}
              forecasts={title.forecasts}
              region="global"
            />
            <RankingsSection
              rankings={title.rankings.us}
              forecasts={title.forecasts}
              region="us"
            />
          </div>
        </section>

        {/* Interest Signals */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Interest Signals</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SignalCard
              data={title.signals.trends}
              title="Google Trends"
              icon={<svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0zm0 22c-5.514 0-10-4.486-10-10S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10zm-1-15h2v8h-2zm0 10h2v2h-2z"/></svg>}
              color="bg-blue-500"
            />
            <SignalCard
              data={title.signals.wikipedia}
              title="Wikipedia Pageviews"
              icon={<svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l2.681-5.476-2.396-5.045c-.166-.361-.314-.601-.436-.721-.121-.12-.314-.187-.564-.194l-.479-.031c-.165 0-.255-.053-.255-.176v-.404c0-.081.06-.135.165-.166l4.803.045.051.045v.434c0 .119-.061.176-.181.176l-.556.031c-.463.015-.654.105-.579.271l1.827 4.082 1.932-4.082c.135-.301.135-.421-.046-.436l-.529-.031c-.135 0-.195-.044-.195-.148v-.404c0-.136.06-.181.181-.181h4.623l.05.045v.434c0 .119-.074.176-.209.176l-.479.031c-.405.015-.69.165-.855.449l-2.754 5.541 2.662 5.405c.391.842 2.249 4.682 2.652 5.521.405.84 1.064.941 1.538.029 1.499-2.881 4.185-8.566 5.521-11.324.164-.341.258-.555.258-.615 0-.24-.249-.39-.749-.45l-.555-.031c-.165 0-.24-.045-.24-.176v-.419l.045-.051h4.803c.104 0 .164.037.164.121v.454c0 .105-.074.164-.224.164l-.525.046c-.511.03-.855.135-1.034.314-.18.195-.36.48-.541.855-1.366 2.834-4.295 8.816-5.656 11.583-.406.81-.661 1.351-.754 1.62-.076.195-.195.27-.359.256-.195 0-.33-.076-.404-.225l-2.726-5.685-2.55 5.399c-.12.256-.256.375-.405.375-.165 0-.285-.075-.359-.24l-2.994-5.955c-.256-.511-.436-.676-.871-.676z"/></svg>}
              color="bg-orange-500"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Daily interest signals help track momentum. Green bars indicate day-over-day increases, red indicates decreases.
          </p>
        </section>

        {/* FlixPatrol Data Section */}
        {(title.flixpatrol?.trailers?.length > 0 || title.flixpatrol?.social?.length > 0) && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Trailer & Social Trends</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {title.flixpatrol.trailers.length > 0 && (
                <div className="lg:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {title.flixpatrol.trailers.slice(0, 4).map((trailer) => (
                      <TrailerCard key={trailer.fpTrailerId} trailer={trailer} />
                    ))}
                  </div>
                </div>
              )}
              <div className={title.flixpatrol.trailers.length > 0 ? '' : 'lg:col-span-3'}>
                <SocialCard social={title.flixpatrol.social} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Trailer views and social following updated every 48 hours. Sparklines show trend over time.
            </p>
          </section>
        )}

        {/* Polymarket Markets */}
        {title.markets.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Polymarket Markets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {title.markets.map(market => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </section>
        )}

        {/* Aliases */}
        {title.aliases && title.aliases.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-gray-500 mb-2">Also known as</h2>
            <div className="flex flex-wrap gap-2">
              {title.aliases.map((alias, i) => (
                <span key={i} className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {alias}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
