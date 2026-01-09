"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

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

interface TitleData {
  id: string;
  canonicalName: string;
  type: "SHOW" | "MOVIE";
  tmdbId: string | null;
  aliases: string[];
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

function SignalChart({
  data,
  title,
  color,
  unit = ""
}: {
  data: SignalData[];
  title: string;
  color: string;
  unit?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
        <p className="text-gray-400 text-sm italic">No data available</p>
      </div>
    );
  }

  // Sort by date ascending for chart
  const sorted = [...data].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const maxValue = Math.max(...sorted.map(d => d.value));
  const minValue = Math.min(...sorted.map(d => d.value));
  const range = maxValue - minValue || 1;

  // Get latest value and trend
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const trend = previous ? ((latest.value - previous.value) / (previous.value || 1)) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-gunmetal">
            {latest.value.toLocaleString()}{unit}
          </p>
          {trend !== 0 && (
            <p className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Simple bar chart */}
      <div className="flex items-end gap-1 h-24">
        {sorted.slice(-14).map((d, i) => {
          const height = ((d.value - minValue) / range) * 100;
          const isLatest = i === sorted.slice(-14).length - 1;
          return (
            <div
              key={`${d.date}-${i}`}
              className="flex-1 group relative"
              title={`${new Date(d.date).toLocaleDateString()}: ${d.value.toLocaleString()}`}
            >
              <div
                className={`w-full rounded-t transition-all ${isLatest ? color : 'bg-gray-300'} hover:opacity-80`}
                style={{ height: `${Math.max(height, 5)}%` }}
              />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gunmetal text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {d.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{new Date(sorted[Math.max(0, sorted.length - 14)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(sorted[sorted.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}

function RankChart({ data, title }: { data: RankData[]; title: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
        <p className="text-gray-400 text-sm italic">No ranking data</p>
      </div>
    );
  }

  // Sort by week ascending
  const sorted = [...data].sort((a, b) =>
    new Date(a.week).getTime() - new Date(b.week).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const rankChange = previous ? previous.rank - latest.rank : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-gunmetal">#{latest.rank}</p>
          {rankChange !== 0 && (
            <p className={`text-sm font-medium ${rankChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rankChange > 0 ? '↑' : '↓'} {Math.abs(rankChange)} spots
            </p>
          )}
        </div>
      </div>

      {/* Rank history - inverted (lower is better) */}
      <div className="flex items-end gap-1 h-24">
        {sorted.slice(-8).map((d, i) => {
          // Invert: rank 1 = 100%, rank 10 = 10%
          const height = ((11 - d.rank) / 10) * 100;
          const isLatest = i === sorted.slice(-8).length - 1;
          return (
            <div
              key={`${d.week}-${i}`}
              className="flex-1 group relative"
            >
              <div
                className={`w-full rounded-t transition-all ${isLatest ? 'bg-pine-blue' : 'bg-gray-300'} hover:opacity-80`}
                style={{ height: `${Math.max(height, 10)}%` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gunmetal text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Week {new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: #{d.rank}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>8 weeks ago</span>
        <span>This week</span>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: MarketData }) {
  const yesPrice = market.latestPrices?.[0];
  const noPrice = market.latestPrices?.[1];

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
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${yesPrice * 100}%` }}
                  />
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

function ForecastCard({ forecast }: { forecast: ForecastData }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-sm text-gray-500">
            Week of {new Date(forecast.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-xs text-gray-400">{forecast.target}</p>
        </div>
        {forecast.confidence && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            forecast.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
            forecast.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {forecast.confidence}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-400">P10</p>
          <p className="font-medium text-gray-600">#{forecast.p10}</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-gray-400">Expected</p>
          <p className="text-2xl font-bold text-gunmetal">#{forecast.p50}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">P90</p>
          <p className="font-medium text-gray-600">#{forecast.p90}</p>
        </div>
      </div>

      {forecast.momentumScore !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Momentum</span>
            <span className={`font-medium ${forecast.momentumScore > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {forecast.momentumScore > 0 ? '+' : ''}{forecast.momentumScore.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TrailerCard({ trailer }: { trailer: TrailerData }) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatChange = (change: number) => {
    if (change === 0) return null;
    const formatted = change > 0 ? `+${formatNumber(change)}` : formatNumber(change);
    return formatted;
  };

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

      {/* Main stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Views */}
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Views</p>
          <p className="text-lg font-bold text-gunmetal">{formatNumber(trailer.current.views)}</p>
          {trailer.changes.views !== 0 && (
            <p className={`text-xs font-medium ${trailer.changes.views > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatChange(trailer.changes.views)}
            </p>
          )}
        </div>

        {/* Likes */}
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Likes</p>
          <p className="text-lg font-bold text-gunmetal">{formatNumber(trailer.current.likes)}</p>
          {trailer.changes.likes !== 0 && (
            <p className={`text-xs font-medium ${trailer.changes.likes > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatChange(trailer.changes.likes)}
            </p>
          )}
        </div>

        {/* Engagement */}
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Engagement</p>
          <p className="text-lg font-bold text-gunmetal">{trailer.current.engagementRatio}%</p>
          <p className="text-xs text-gray-400">like ratio</p>
        </div>
      </div>

      {/* Views history mini-chart */}
      {trailer.history.length > 1 && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Views trend</p>
          <div className="flex items-end gap-1 h-12">
            {trailer.history.slice(-10).map((h, i) => {
              const maxViews = Math.max(...trailer.history.slice(-10).map(p => p.views));
              const minViews = Math.min(...trailer.history.slice(-10).map(p => p.views));
              const range = maxViews - minViews || 1;
              const height = ((h.views - minViews) / range) * 100;
              const isLatest = i === trailer.history.slice(-10).length - 1;

              return (
                <div
                  key={`${h.date}-${i}`}
                  className="flex-1 group relative"
                  title={`${new Date(h.date).toLocaleDateString()}: ${formatNumber(h.views)} views`}
                >
                  <div
                    className={`w-full rounded-t ${isLatest ? 'bg-red-500' : 'bg-red-200'}`}
                    style={{ height: `${Math.max(height, 10)}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SocialCard({ social }: { social: SocialData[] }) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'facebook':
        return (
          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'twitter':
        return (
          <svg className="w-5 h-5 text-sky-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        );
      case 'instagram':
        return (
          <svg className="w-5 h-5 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        );
      case 'reddit':
        return (
          <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
          </svg>
        );
      case 'youtube':
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'tiktok':
        return (
          <svg className="w-5 h-5 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'facebook': return 'bg-blue-50 border-blue-200';
      case 'twitter': return 'bg-sky-50 border-sky-200';
      case 'instagram': return 'bg-pink-50 border-pink-200';
      case 'reddit': return 'bg-orange-50 border-orange-200';
      case 'youtube': return 'bg-red-50 border-red-200';
      case 'tiktok': return 'bg-gray-50 border-gray-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  if (!social || social.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">Social Following</h3>
        <p className="text-gray-400 text-sm italic">No social data available</p>
      </div>
    );
  }

  // Calculate total followers
  const totalFollowers = social.reduce((sum, s) => sum + s.current.followers, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-gray-500">Social Following</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-gunmetal">{formatNumber(totalFollowers)}</p>
          <p className="text-xs text-gray-400">total followers</p>
        </div>
      </div>

      {/* Platform breakdown */}
      <div className="space-y-3">
        {social.map((s) => (
          <div
            key={s.platform}
            className={`flex items-center justify-between p-2 rounded-lg border ${getPlatformColor(s.platform)}`}
          >
            <div className="flex items-center gap-2">
              {getPlatformIcon(s.platform)}
              <span className="text-sm font-medium capitalize">{s.platform}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gunmetal">{formatNumber(s.current.followers)}</p>
              {s.followersChange !== 0 && (
                <p className={`text-xs font-medium ${s.followersChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {s.followersChange > 0 ? '+' : ''}{formatNumber(s.followersChange)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
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

  // Get the primary category from latest ranking
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
        {/* Rankings Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Netflix Rankings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RankChart data={title.rankings.global} title="Global Top 10" />
            <RankChart data={title.rankings.us} title="US Top 10" />
          </div>
        </section>

        {/* Signals Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gunmetal mb-4">Interest Signals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignalChart
              data={title.signals.trends}
              title="Google Trends"
              color="bg-blue-500"
            />
            <SignalChart
              data={title.signals.wikipedia}
              title="Wikipedia Pageviews"
              color="bg-orange-500"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Daily interest signals help track momentum. Rising signals may indicate growing popularity.
          </p>
        </section>

        {/* FlixPatrol Data Section */}
        {(title.flixpatrol?.trailers?.length > 0 || title.flixpatrol?.social?.length > 0) && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Trailer & Social Data</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Trailers */}
              {title.flixpatrol.trailers.length > 0 && (
                <div className="lg:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {title.flixpatrol.trailers.slice(0, 4).map((trailer) => (
                      <TrailerCard key={trailer.fpTrailerId} trailer={trailer} />
                    ))}
                  </div>
                </div>
              )}

              {/* Social */}
              <div className={title.flixpatrol.trailers.length > 0 ? '' : 'lg:col-span-3'}>
                <SocialCard social={title.flixpatrol.social} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Trailer views and social following updated every 48 hours. Changes shown since last update.
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

        {/* Forecasts */}
        {title.forecasts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">Rank Forecasts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {title.forecasts.map((forecast, i) => (
                <ForecastCard key={i} forecast={forecast} />
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
