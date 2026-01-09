'use client';

interface TitleRatingsProps {
  ratings: {
    imdbId: string | null;
    imdbRating: number | null;
    imdbVotes: number | null;
    rtCriticScore: number | null;
    metascore: number | null;
    rated: string | null;
  } | null;
}

export function TitleRatings({ ratings }: TitleRatingsProps) {
  if (!ratings) return null;

  const hasAnyRating =
    ratings.imdbRating || ratings.rtCriticScore || ratings.metascore;

  if (!hasAnyRating) return null;

  // Determine RT freshness
  const getRTStatus = (score: number) => {
    if (score >= 60) return { label: 'Fresh', color: 'text-red-400', bg: 'bg-red-500/20' };
    return { label: 'Rotten', color: 'text-green-400', bg: 'bg-green-500/20' };
  };

  // Determine Metascore color
  const getMetascoreColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4">
      <h3 className="text-sm font-medium text-slate-200 mb-3">Critic Ratings</h3>

      <div className="flex flex-wrap gap-4">
        {/* IMDB Rating */}
        {ratings.imdbRating && (
          <a
            href={ratings.imdbId ? `https://www.imdb.com/title/${ratings.imdbId}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 hover:bg-slate-900/70 transition-colors"
          >
            <div className="flex flex-col items-center">
              <span className="text-yellow-400 text-lg">★</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span className="text-white font-bold text-lg">{ratings.imdbRating.toFixed(1)}</span>
                <span className="text-slate-500 text-sm">/10</span>
              </div>
              <span className="text-xs text-slate-500">
                IMDb ({ratings.imdbVotes ? formatVotes(ratings.imdbVotes) : 'N/A'})
              </span>
            </div>
          </a>
        )}

        {/* Rotten Tomatoes */}
        {ratings.rtCriticScore !== null && (
          <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                getRTStatus(ratings.rtCriticScore).bg
              }`}
            >
              <span className="text-lg">{ratings.rtCriticScore >= 60 ? '🍅' : '🤢'}</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span className={`font-bold text-lg ${getRTStatus(ratings.rtCriticScore).color}`}>
                  {ratings.rtCriticScore}%
                </span>
              </div>
              <span className="text-xs text-slate-500">Rotten Tomatoes</span>
            </div>
          </div>
        )}

        {/* Metascore */}
        {ratings.metascore !== null && (
          <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
            <div
              className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm ${getMetascoreColor(
                ratings.metascore
              )}`}
            >
              {ratings.metascore}
            </div>
            <div className="flex flex-col">
              <span className="text-white font-medium">Metascore</span>
              <span className="text-xs text-slate-500">Metacritic</span>
            </div>
          </div>
        )}

        {/* Content Rating */}
        {ratings.rated && (
          <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
            <span className="px-2 py-1 bg-slate-700 rounded text-white font-medium text-sm">
              {ratings.rated}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatVotes(votes: number): string {
  if (votes >= 1000000) {
    return `${(votes / 1000000).toFixed(1)}M`;
  }
  if (votes >= 1000) {
    return `${(votes / 1000).toFixed(0)}K`;
  }
  return votes.toString();
}
