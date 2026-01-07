"use client";

interface ArticlePrediction {
  predictedWinner: string;
  predictedFilm?: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  quote?: string;
  alternates?: string[];
}

interface Article {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  predictions: ArticlePrediction | null;
}

interface ArticleSectionProps {
  articles: Article[];
  categoryName: string;
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = {
    high: { label: "High Confidence", color: "bg-green-100 text-green-700 border-green-200" },
    medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    low: { label: "Low", color: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  const { label, color } = config[confidence];

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function SourceIcon({ source }: { source: string }) {
  // Color coding by source
  const colors: Record<string, string> = {
    Variety: "bg-purple-500",
    "Hollywood Reporter": "bg-blue-500",
    "Awards Daily": "bg-amber-500",
    "Gold Derby": "bg-yellow-500",
    IndieWire: "bg-green-500",
    "Award Expert": "bg-red-500",
    StyleRave: "bg-pink-500",
  };

  const color = colors[source] || "bg-gray-500";

  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>
      {source.charAt(0)}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const prediction = article.predictions;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <SourceIcon source={article.source} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500">{article.source}</span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-400">
              {new Date(article.publishedAt).toLocaleDateString()}
            </span>
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gunmetal hover:text-pine-blue transition-colors line-clamp-2"
          >
            {article.title}
          </a>

          {prediction && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">Predicts:</span>
                <span className="font-semibold text-gunmetal">{prediction.predictedWinner}</span>
                {prediction.predictedFilm && (
                  <span className="text-sm text-gray-500">({prediction.predictedFilm})</span>
                )}
                <ConfidenceBadge confidence={prediction.confidence} />
              </div>

              {prediction.reasoning && (
                <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                  {prediction.reasoning}
                </p>
              )}

              {prediction.quote && (
                <blockquote className="text-xs text-gray-500 italic border-l-2 border-old-gold pl-2 line-clamp-2">
                  "{prediction.quote}"
                </blockquote>
              )}

              {prediction.alternates && prediction.alternates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400">Also mentioned:</span>
                  {prediction.alternates.slice(0, 3).map((alt, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {alt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArticleSection({ articles, categoryName }: ArticleSectionProps) {
  if (!articles || articles.length === 0) {
    return null;
  }

  // Count predictions by winner
  const predictionCounts: Record<string, number> = {};
  for (const article of articles) {
    if (article.predictions?.predictedWinner) {
      const winner = article.predictions.predictedWinner;
      predictionCounts[winner] = (predictionCounts[winner] || 0) + 1;
    }
  }

  const sortedWinners = Object.entries(predictionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gunmetal flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          Expert Analysis
        </h2>
        <span className="text-sm text-gray-500">{articles.length} articles</span>
      </div>

      {/* Summary of who experts are predicting */}
      {sortedWinners.length > 0 && (
        <div className="bg-white rounded-lg p-3 mb-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Expert consensus:</span>{" "}
            {sortedWinners.map(([winner, count], i) => (
              <span key={winner}>
                {i > 0 && ", "}
                <span className="font-semibold text-gunmetal">{winner}</span>
                <span className="text-gray-400"> ({count}/{articles.length})</span>
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Article list */}
      <div className="space-y-3">
        {articles.slice(0, 5).map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      {articles.length > 5 && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          +{articles.length - 5} more articles
        </p>
      )}
    </div>
  );
}
