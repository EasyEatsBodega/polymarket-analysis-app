// Title Types
export type TitleType = "SHOW" | "MOVIE";

// Signal Sources
export type SignalSource = "TRENDS" | "WIKIPEDIA";

// Geographic regions
export type GeoRegion = "US" | "GLOBAL";

// Forecast targets
export type ForecastTarget = "GLOBAL_VIEWS" | "US_RANK";

// Job status
export type JobStatus = "SUCCESS" | "FAIL" | "RUNNING";

// Dashboard tab types
export type DashboardTab = "global-shows" | "global-movies" | "us-shows" | "us-movies";

// Mover entry for dashboard display
export interface MoverEntry {
  id: string;
  title: string;
  type: TitleType;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  views: number | null;
  momentumScore: number;
  forecastP10: number | null;
  forecastP50: number | null;
  forecastP90: number | null;
}

// Breakout entry
export interface BreakoutEntry {
  id: string;
  title: string;
  type: TitleType;
  momentumScore: number;
  accelerationScore: number;
  currentRank: number | null;
}

// Polymarket market data
export interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  outcomes: PolymarketOutcome[];
  volume: number;
  liquidity: number;
  lastUpdated: string;
}

export interface PolymarketOutcome {
  id: string;
  name: string;
  price: number;
}

// Forecast comparison (model vs market)
export interface ForecastComparison {
  titleId: string;
  titleName: string;
  modelForecast: {
    p10: number;
    p50: number;
    p90: number;
  };
  marketPrice: number;
  discrepancy: number;
  marketId: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Config types for admin settings
export interface MomentumWeights {
  trendsWeight: number;
  wikipediaWeight: number;
  rankDeltaWeight: number;
}

export interface AppConfig {
  momentumWeights: MomentumWeights;
  breakoutThreshold: number;
}
