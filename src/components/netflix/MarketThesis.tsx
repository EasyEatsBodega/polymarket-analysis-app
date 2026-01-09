'use client';

import { useEffect, useState } from 'react';

interface CastMember {
  name: string;
  tier: 'A_LIST' | 'NOTABLE' | 'RISING';
  knownFor: string;
}

interface Signal {
  type: string;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  description: string;
  details?: string;
}

interface ThesisData {
  summary: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  starPowerScore: number;
  notableCast: CastMember[];
  signals: Signal[];
}

interface MarketThesisProps {
  titleId: string;
  titleName: string;
}

export function MarketThesis({ titleId, titleName }: MarketThesisProps) {
  const [thesis, setThesis] = useState<ThesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchThesis() {
      try {
        const response = await fetch(`/api/titles/${titleId}/thesis`);
        const data = await response.json();

        if (data.success) {
          setThesis(data.data.thesis);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError('Failed to load market analysis');
      } finally {
        setLoading(false);
      }
    }

    fetchThesis();
  }, [titleId]);

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-48 mb-4" />
        <div className="h-4 bg-slate-700 rounded w-full mb-2" />
        <div className="h-4 bg-slate-700 rounded w-3/4" />
      </div>
    );
  }

  if (error || !thesis) {
    return null; // Silently fail if no thesis available
  }

  const confidenceColors = {
    HIGH: 'text-green-400 bg-green-400/10 border-green-400/30',
    MEDIUM: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    LOW: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  };

  const tierBadges = {
    A_LIST: { label: 'A-List', class: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    NOTABLE: { label: 'Notable', class: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    RISING: { label: 'Rising', class: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  };

  const signalIcons: Record<string, string> = {
    STAR_POWER: '⭐',
    SOURCE_MATERIAL: '📚',
    GENRE: '🎬',
    BUZZ: '🔥',
    TIMING: '📅',
    TRACK_RECORD: '📈',
    MARKETING: '📣',
  };

  const strengthColors = {
    STRONG: 'border-l-green-500',
    MODERATE: 'border-l-yellow-500',
    WEAK: 'border-l-slate-500',
  };

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-lg border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            Why This Price?
          </h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              confidenceColors[thesis.confidence]
            }`}
          >
            {thesis.confidence} Confidence
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-6 py-4">
        <p className="text-slate-200 text-base leading-relaxed">{thesis.summary}</p>
      </div>

      {/* Notable Cast */}
      {thesis.notableCast.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-700/30">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Notable Cast</h4>
          <div className="flex flex-wrap gap-2">
            {thesis.notableCast.map((member) => (
              <div
                key={member.name}
                className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 border border-slate-700"
              >
                <span className="text-white font-medium">{member.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    tierBadges[member.tier].class
                  }`}
                >
                  {tierBadges[member.tier].label}
                </span>
              </div>
            ))}
          </div>
          {thesis.notableCast.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Known for: {thesis.notableCast.map((c) => c.knownFor).join(' • ')}
            </p>
          )}
        </div>
      )}

      {/* Star Power Score */}
      <div className="px-6 py-4 border-t border-slate-700/30">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-400">Star Power</h4>
          <span className="text-white font-bold">{thesis.starPowerScore}/100</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              thesis.starPowerScore >= 70
                ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                : thesis.starPowerScore >= 40
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                : 'bg-gradient-to-r from-slate-500 to-slate-400'
            }`}
            style={{ width: `${thesis.starPowerScore}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {thesis.starPowerScore >= 70
            ? 'Strong name recognition likely to drive viewership'
            : thesis.starPowerScore >= 40
            ? 'Moderate star power with some recognizable names'
            : 'Limited mainstream star recognition'}
        </p>
      </div>

      {/* Signals */}
      {thesis.signals.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-700/30">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Market Signals</h4>
          <div className="space-y-2">
            {thesis.signals.map((signal, idx) => (
              <div
                key={idx}
                className={`bg-slate-800/50 rounded-lg px-4 py-3 border-l-4 ${
                  strengthColors[signal.strength]
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">{signalIcons[signal.type] || '📊'}</span>
                  <div>
                    <p className="text-slate-200 text-sm">{signal.description}</p>
                    {signal.details && (
                      <p className="text-xs text-slate-500 mt-1">{signal.details}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-700/30">
        <p className="text-xs text-slate-500">
          Analysis based on cast data, source material, genre performance, and pre-release signals.
        </p>
      </div>
    </div>
  );
}
