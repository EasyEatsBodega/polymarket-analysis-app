/**
 * Polymarket API Client
 *
 * Fetches trade data and wallet activity from Polymarket's data API.
 * Used by the Insider Finder feature to detect suspicious trading patterns.
 */

import axios, { AxiosInstance } from 'axios';

// Polymarket Data API base URL
const POLYMARKET_API_BASE = 'https://data-api.polymarket.com';

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 200; // Delay between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Market categories to exclude from insider detection
const EXCLUDED_CATEGORIES = [
  'crypto',
  'cryptocurrency',
  'bitcoin',
  'ethereum',
  'sports',
  'nfl',
  'nba',
  'mlb',
  'nhl',
  'soccer',
  'football',
  'baseball',
  'basketball',
  'hockey',
  'tennis',
  'golf',
  'mma',
  'ufc',
  'boxing',
];

// Keywords in market titles/slugs that indicate crypto or sports
const EXCLUDED_KEYWORDS = [
  // Crypto
  'btc',
  'eth',
  'sol',
  'bitcoin',
  'ethereum',
  'solana',
  'crypto',
  'token',
  'coin',
  'defi',
  'nft',
  'xrp',
  'doge',
  'cardano',
  'polkadot',
  // Sports - Betting patterns
  'o/u',
  'over/under',
  'spread:',
  'spread ',
  'moneyline',
  'parlay',
  'point-spread',
  'total-points',
  'total-goals',
  // Sports - Match patterns
  ' vs ',
  ' vs. ',
  '-vs-',
  '-at-',
  'win on 2',  // "win on 2026-01-06" pattern
  'win-game',
  'win-series',
  'make-playoffs',
  'win-division',
  'win-conference',
  'win-championship',
  // Sports - Events
  'super-bowl',
  'superbowl',
  'world-series',
  'nba-finals',
  'stanley-cup',
  'champions-league',
  'world-cup',
  'playoffs',
  'playoff',
  'march-madness',
  'ncaa',
  'college-football',
  'college-basketball',
  'uefa',
  'fifa',
  'afcon',
  'copa-america',
  'euro-2',
  // Sports - Terms
  'mvp',
  'touchdown',
  'home-run',
  'slam-dunk',
  'rushing-yards',
  'passing-yards',
  'rebounds',
  'assists',
  'three-pointers',
  'field-goals',
  'strikeouts',
  'goals-scored',
  'clean-sheet',
  'hat-trick',
  'calcio',  // Italian for soccer
  'futbol',
  'fc ',
  ' fc',
  'f.c.',
  'a.c.',
  'a.s.',
  's.s.',
  // Sports - Leagues
  'nfl',
  'nba',
  'mlb',
  'nhl',
  'mls',
  'epl',
  'premier-league',
  'la-liga',
  'serie-a',
  'serie a',
  'bundesliga',
  'ligue-1',
  'ligue 1',
  'eredivisie',
  'primeira-liga',
  'scottish-premier',
  'j-league',
  'k-league',
  'a-league',
  // Sports - International soccer/football
  'algeria',
  'congo',
  'nigeria',
  'senegal',
  'cameroon',
  'morocco',
  'egypt',
  'ghana',
  'ivory-coast',
  'tunisia',
  'mali',
  'burkina',
  'sassuolo',
  'como 1907',
  'inter milan',
  'ac milan',
  'juventus',
  'napoli',
  'roma',
  'lazio',
  'fiorentina',
  'atalanta',
  'torino',
  'bologna',
  'real madrid',
  'barcelona',
  'atletico',
  'sevilla',
  'valencia',
  'villarreal',
  'real betis',
  'manchester united',
  'manchester city',
  'liverpool',
  'chelsea',
  'arsenal',
  'tottenham',
  'west ham',
  'newcastle',
  'aston villa',
  'everton',
  'leicester',
  'bayern',
  'dortmund',
  'leipzig',
  'leverkusen',
  'psg',
  'paris saint',
  'marseille',
  'lyon',
  'monaco',
  'ajax',
  'psv',
  'feyenoord',
  'benfica',
  'porto',
  'sporting',
  // Sports - US Teams
  'lakers',
  'celtics',
  'warriors',
  'bulls',
  'heat',
  'knicks',
  'nets',
  'cavaliers',
  'thunder',
  'nuggets',
  'clippers',
  'suns',
  'mavericks',
  'spurs',
  'rockets',
  'grizzlies',
  'pelicans',
  'timberwolves',
  'blazers',
  'kings',
  'magic',
  'hornets',
  'wizards',
  'pacers',
  'pistons',
  'hawks',
  'raptors',
  'bucks',
  '76ers',
  'sixers',
  'yankees',
  'dodgers',
  'red sox',
  'red-sox',
  'cubs',
  'mets',
  'braves',
  'astros',
  'phillies',
  'padres',
  'mariners',
  'blue jays',
  'twins',
  'orioles',
  'guardians',
  'rangers',
  'rays',
  'brewers',
  'diamondbacks',
  'd-backs',
  'giants',
  'cardinals',
  'reds',
  'pirates',
  'royals',
  'tigers',
  'white sox',
  'white-sox',
  'rockies',
  'marlins',
  'athletics',
  'angels',
  'nationals',
  'patriots',
  'chiefs',
  'eagles',
  'cowboys',
  '49ers',
  'packers',
  'ravens',
  'bills',
  'dolphins',
  'jets',
  'broncos',
  'raiders',
  'chargers',
  'steelers',
  'browns',
  'bengals',
  'lions',
  'bears',
  'vikings',
  'saints',
  'falcons',
  'panthers',
  'buccaneers',
  'commanders',
  'rams',
  'seahawks',
  'titans',
  'colts',
  'texans',
  'jaguars',
];

/**
 * Raw trade data from Polymarket API
 */
export interface PolymarketRawTrade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  pseudonym?: string;
  transactionHash: string;
}

/**
 * Market data from Polymarket API
 */
export interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;
  tags: string[];
  question: string;
  end_date_iso: string;
  game_start_time: string | null;
  seconds_delay: number;
  fpmm: string;
  maker_base_fee: number;
  taker_base_fee: number;
  notifications_enabled: boolean;
  neg_risk: boolean;
  neg_risk_market_id: string;
  neg_risk_request_id: string;
  icon: string;
  image: string;
  description: string;
  outcomes: string;
  outcome_prices: string;
  volume: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  submitted_by: string;
  resolved: boolean;
  resolvedBy: string;
  resolution: string;
  volume_num: number;
  liquidity_num: number;
  accepting_orders: boolean;
  accepting_order_timestamp: string;
  enable_order_book: boolean;
  minimum_order_size: number;
  minimum_tick_size: number;
  slug: string;
  rewards: {
    min_size: number;
    max_spread: number;
    event_start_date: string;
    event_end_date: string;
    in_game_multiplier: number;
    rewards_daily_rate: number;
    rewards_min_size: number;
    rewards_max_spread: number;
  };
}

/**
 * Processed trade data for insider detection
 */
export interface ProcessedTrade {
  id: string;
  walletAddress: string;
  conditionId: string;
  marketQuestion: string;
  marketSlug: string;
  marketCategory: string | null;
  outcomeName: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  usdValue: number;
  timestamp: Date;
  transactionHash: string;
  marketResolved: boolean;
  marketEndDate: Date | null;
}

/**
 * Options for fetching trades
 */
export interface FetchTradesOptions {
  limit?: number;
  offset?: number;
  market?: string;
  user?: string;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Create an axios instance with rate limiting
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: POLYMARKET_API_BASE,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  return client;
}

const apiClient = createApiClient();

/**
 * Sleep utility for rate limiting
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for API calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`API call failed (attempt ${attempt + 1}/${retries}):`, lastError.message);

      if (attempt < retries - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError;
}

/**
 * Classify a market's category based on title, slug, and tags
 * Returns null if the market should be excluded (crypto or sports)
 */
export function classifyMarketCategory(
  question: string,
  slug: string,
  tags: string[] = []
): string | null {
  const lowerQuestion = question.toLowerCase();
  const lowerSlug = slug.toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase());

  // Check if any excluded categories match
  for (const category of EXCLUDED_CATEGORIES) {
    if (lowerTags.includes(category)) {
      return null; // Excluded category
    }
  }

  // Check for excluded keywords in question or slug
  for (const keyword of EXCLUDED_KEYWORDS) {
    if (lowerQuestion.includes(keyword) || lowerSlug.includes(keyword)) {
      return null; // Excluded keyword found
    }
  }

  // Determine category from tags
  if (lowerTags.includes('politics')) return 'politics';
  if (lowerTags.includes('entertainment')) return 'entertainment';
  if (lowerTags.includes('science')) return 'science';
  if (lowerTags.includes('business')) return 'business';
  if (lowerTags.includes('technology')) return 'technology';
  if (lowerTags.includes('economics')) return 'economics';
  if (lowerTags.includes('culture')) return 'culture';

  // Default to 'other' if not excluded
  return 'other';
}

/**
 * Fetch a single market by condition ID
 */
export async function fetchMarket(conditionId: string): Promise<PolymarketMarket | null> {
  try {
    await sleep(RATE_LIMIT_DELAY_MS);
    const response = await withRetry(async () =>
      apiClient.get(`/markets/${conditionId}`)
    );
    return response.data;
  } catch (error) {
    console.warn(`Failed to fetch market ${conditionId}:`, error);
    return null;
  }
}

/**
 * Fetch recent trades from Polymarket
 */
export async function fetchRecentTrades(
  options: FetchTradesOptions = {}
): Promise<PolymarketRawTrade[]> {
  const { limit = 100, offset = 0, market, user, startTime, endTime } = options;

  const params: Record<string, string | number> = {
    limit,
    offset,
  };

  if (market) params.market = market;
  if (user) params.user = user;

  try {
    await sleep(RATE_LIMIT_DELAY_MS);
    const response = await withRetry(async () =>
      apiClient.get('/trades', { params })
    );

    let trades: PolymarketRawTrade[] = response.data || [];

    // Filter by time if specified (timestamp is unix seconds)
    if (startTime || endTime) {
      const startUnix = startTime ? Math.floor(startTime.getTime() / 1000) : 0;
      const endUnix = endTime ? Math.floor(endTime.getTime() / 1000) : Infinity;

      trades = trades.filter((trade) => {
        return trade.timestamp >= startUnix && trade.timestamp <= endUnix;
      });
    }

    return trades;
  } catch (error) {
    console.error('Failed to fetch recent trades:', error);
    return [];
  }
}

/**
 * Fetch trades for a specific wallet address
 */
export async function fetchTradesByWallet(
  walletAddress: string,
  options: Omit<FetchTradesOptions, 'user'> = {}
): Promise<PolymarketRawTrade[]> {
  const allTrades: PolymarketRawTrade[] = [];
  let offset = 0;
  const limit = options.limit || 100;

  // Fetch all trades for this wallet
  while (true) {
    const trades = await fetchRecentTrades({
      ...options,
      user: walletAddress,
      limit,
      offset,
    });

    if (trades.length === 0) break;

    allTrades.push(...trades);
    offset += limit;

    // Safety limit to prevent infinite loops
    if (offset > 1000) break;
  }

  return allTrades;
}

/**
 * Process raw trade data into a structured format
 * The trades endpoint already includes market info (title, slug, outcome)
 *
 * @param filterExcluded - If true, skip sports/crypto markets. Default false to capture all trades.
 */
export async function processTradeData(
  rawTrade: PolymarketRawTrade,
  marketCache: Map<string, PolymarketMarket | null>,
  filterExcluded: boolean = false
): Promise<ProcessedTrade | null> {
  // Classify the market category using data from the trade itself
  const category = classifyMarketCategory(
    rawTrade.title,
    rawTrade.slug,
    [] // Tags not available in trade data, but we can classify from title/slug
  );

  // Optionally skip excluded markets (crypto, sports)
  if (filterExcluded && category === null) {
    return null;
  }

  const size = rawTrade.size;
  const price = rawTrade.price;

  return {
    id: rawTrade.transactionHash, // Use transaction hash as ID
    walletAddress: rawTrade.proxyWallet,
    conditionId: rawTrade.conditionId,
    marketQuestion: rawTrade.title,
    marketSlug: rawTrade.slug,
    marketCategory: category || 'other', // Use 'other' for sports/crypto if not filtered
    outcomeName: rawTrade.outcome,
    side: rawTrade.side,
    size,
    price,
    usdValue: size * price,
    timestamp: new Date(rawTrade.timestamp * 1000), // Unix timestamp to Date
    transactionHash: rawTrade.transactionHash,
    marketResolved: false, // Not available in trade data, will be checked separately
    marketEndDate: null,
  };
}

/**
 * Fetch and process trades for multiple wallets in parallel
 */
export async function fetchAndProcessTrades(
  walletAddresses: string[],
  options: FetchTradesOptions = {}
): Promise<Map<string, ProcessedTrade[]>> {
  const results = new Map<string, ProcessedTrade[]>();
  const marketCache = new Map<string, PolymarketMarket | null>();

  for (const address of walletAddresses) {
    const rawTrades = await fetchTradesByWallet(address, options);
    const processedTrades: ProcessedTrade[] = [];

    for (const rawTrade of rawTrades) {
      const processed = await processTradeData(rawTrade, marketCache);
      if (processed) {
        processedTrades.push(processed);
      }
    }

    results.set(address, processedTrades);
  }

  return results;
}

/**
 * Scan for new wallets with trades matching insider criteria
 */
export async function scanForNewWallets(
  options: {
    daysBack?: number;
    minTradeSize?: number;
    maxTrades?: number;
  } = {}
): Promise<Map<string, ProcessedTrade[]>> {
  const { daysBack = 30, minTradeSize = 100, maxTrades = 20 } = options;

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - daysBack);

  const walletTrades = new Map<string, ProcessedTrade[]>();
  const marketCache = new Map<string, PolymarketMarket | null>();
  const seenTransactions = new Set<string>();

  let offset = 0;
  const limit = 100;
  let emptyPages = 0;

  console.log(`Scanning for new wallets (last ${daysBack} days, min $${minTradeSize}, max ${maxTrades} trades)...`);

  // Paginate through recent trades
  while (emptyPages < 3) {
    const rawTrades = await fetchRecentTrades({
      limit,
      offset,
      startTime,
    });

    if (rawTrades.length === 0) {
      emptyPages++;
      offset += limit;
      continue;
    }

    emptyPages = 0;

    for (const rawTrade of rawTrades) {
      // Skip if we've already processed this transaction
      if (seenTransactions.has(rawTrade.transactionHash)) continue;
      seenTransactions.add(rawTrade.transactionHash);

      const processed = await processTradeData(rawTrade, marketCache);
      if (!processed) continue;

      // Skip trades below minimum size
      if (processed.usdValue < minTradeSize) continue;

      // Add to wallet's trades
      const walletAddress = processed.walletAddress;
      if (!walletTrades.has(walletAddress)) {
        walletTrades.set(walletAddress, []);
      }

      const trades = walletTrades.get(walletAddress)!;
      trades.push(processed);
    }

    offset += limit;

    // Safety limit
    if (offset > 50000) {
      console.log('Reached safety limit of 50000 trades');
      break;
    }

    console.log(`Processed ${offset} trades, found ${walletTrades.size} unique wallets`);
  }

  // Filter to wallets with <= maxTrades
  const qualifyingWallets = new Map<string, ProcessedTrade[]>();
  for (const [address, trades] of walletTrades) {
    if (trades.length <= maxTrades) {
      qualifyingWallets.set(address, trades);
    }
  }

  console.log(`Found ${qualifyingWallets.size} qualifying wallets (${maxTrades} or fewer trades)`);

  return qualifyingWallets;
}

/**
 * Get current prices for a market's outcomes
 */
export async function getMarketPrices(
  conditionId: string
): Promise<Map<string, number> | null> {
  const market = await fetchMarket(conditionId);
  if (!market) return null;

  const prices = new Map<string, number>();
  for (const token of market.tokens || []) {
    prices.set(token.outcome, token.price);
  }

  return prices;
}

/**
 * Check if a market has resolved and get the winning outcome
 */
export async function getMarketResolution(
  conditionId: string
): Promise<{ resolved: boolean; winner: string | null } | null> {
  const market = await fetchMarket(conditionId);
  if (!market) return null;

  if (!market.resolved) {
    return { resolved: false, winner: null };
  }

  const winner = market.tokens?.find((t) => t.winner)?.outcome || null;
  return { resolved: true, winner };
}
