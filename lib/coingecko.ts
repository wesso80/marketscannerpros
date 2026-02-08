/**
 * CoinGecko API Client
 * 
 * Commercial Plan (Analyst): 500 calls/minute, 500,000 calls/month
 * API Docs: https://docs.coingecko.com/reference/introduction
 * 
 * Includes:
 * - Spot market data (prices, market cap, volume, OHLC)
 * - Derivatives data (funding rates, open interest, volume)
 * - Exchange data (volume, trading pairs)
 * - Historical data (10 years on Analyst plan)
 */

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const FREE_URL = 'https://api.coingecko.com/api/v3';

// Use Pro API if key is available, otherwise fall back to free tier
const getBaseUrl = () => COINGECKO_API_KEY ? BASE_URL : FREE_URL;

// Request headers with API key
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  if (COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
  }
  return headers;
};

// Symbol to CoinGecko ID mapping
export const COINGECKO_ID_MAP: Record<string, string> = {
  // Major Cryptocurrencies
  'BTC': 'bitcoin',
  'BTCUSDT': 'bitcoin',
  'ETH': 'ethereum',
  'ETHUSDT': 'ethereum',
  'BNB': 'binancecoin',
  'BNBUSDT': 'binancecoin',
  'SOL': 'solana',
  'SOLUSDT': 'solana',
  'XRP': 'ripple',
  'XRPUSDT': 'ripple',
  'ADA': 'cardano',
  'ADAUSDT': 'cardano',
  'DOGE': 'dogecoin',
  'DOGEUSDT': 'dogecoin',
  'AVAX': 'avalanche-2',
  'AVAXUSDT': 'avalanche-2',
  'DOT': 'polkadot',
  'DOTUSDT': 'polkadot',
  'LINK': 'chainlink',
  'LINKUSDT': 'chainlink',
  'MATIC': 'matic-network',
  'MATICUSDT': 'matic-network',
  'LTC': 'litecoin',
  'LTCUSDT': 'litecoin',
  'SHIB': 'shiba-inu',
  'SHIBUSDT': 'shiba-inu',
  'UNI': 'uniswap',
  'UNIUSDT': 'uniswap',
  'ATOM': 'cosmos',
  'ATOMUSDT': 'cosmos',
  'XLM': 'stellar',
  'XLMUSDT': 'stellar',
  'TRX': 'tron',
  'TRXUSDT': 'tron',
  'NEAR': 'near',
  'NEARUSDT': 'near',
  'APT': 'aptos',
  'APTUSDT': 'aptos',
  'ARB': 'arbitrum',
  'ARBUSDT': 'arbitrum',
  'OP': 'optimism',
  'OPUSDT': 'optimism',
  // Special tokens
  'JUP': 'jupiter-ag',
  'JUPUSDT': 'jupiter-ag',
  'RENDER': 'render-token',
  'RENDERUSDT': 'render-token',
  'KAS': 'kaspa',
  'KASUSDT': 'kaspa',
  'SUI': 'sui',
  'SUIUSDT': 'sui',
  'SEI': 'sei-network',
  'SEIUSDT': 'sei-network',
  'INJ': 'injective-protocol',
  'INJUSDT': 'injective-protocol',
  'FET': 'fetch-ai',
  'FETUSDT': 'fetch-ai',
  'PEPE': 'pepe',
  'PEPEUSDT': 'pepe',
  'WIF': 'dogwifcoin',
  'WIFUSDT': 'dogwifcoin',
  'BONK': 'bonk',
  'BONKUSDT': 'bonk',
  // Stablecoins
  'USDT': 'tether',
  'USDC': 'usd-coin',
};

export interface CoinGeckoPrice {
  usd: number;
  usd_24h_change?: number;
  usd_24h_vol?: number;
  usd_market_cap?: number;
}

export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  price_change_24h: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  total_supply: number;
  sparkline_in_7d?: { price: number[] };
}

/**
 * Get simple price for multiple coins
 * Endpoint: /simple/price
 * Rate: Very efficient - 1 call for multiple coins
 */
export async function getSimplePrices(
  ids: string[],
  options?: {
    include_24h_change?: boolean;
    include_24h_vol?: boolean;
    include_market_cap?: boolean;
  }
): Promise<Record<string, CoinGeckoPrice> | null> {
  try {
    const params = new URLSearchParams({
      ids: ids.join(','),
      vs_currencies: 'usd',
      include_24hr_change: String(options?.include_24h_change ?? true),
      include_24hr_vol: String(options?.include_24h_vol ?? false),
      include_market_cap: String(options?.include_market_cap ?? false),
    });

    const res = await fetch(`${getBaseUrl()}/simple/price?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Price fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Price fetch error:', error);
    return null;
  }
}

/**
 * Get market data for top coins
 * Endpoint: /coins/markets
 * Provides comprehensive market data including 24h change, volume, market cap
 */
export async function getMarketData(
  options?: {
    ids?: string[];
    per_page?: number;
    page?: number;
    order?: 'market_cap_desc' | 'market_cap_asc' | 'volume_desc' | 'volume_asc';
    sparkline?: boolean;
  }
): Promise<CoinGeckoMarketData[] | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      order: options?.order ?? 'market_cap_desc',
      per_page: String(options?.per_page ?? 100),
      page: String(options?.page ?? 1),
      sparkline: String(options?.sparkline ?? false),
    });

    if (options?.ids?.length) {
      params.set('ids', options.ids.join(','));
    }

    const res = await fetch(`${getBaseUrl()}/coins/markets?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 120 }, // Cache for 2 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Markets fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Markets fetch error:', error);
    return null;
  }
}

/**
 * Get OHLC candlestick data
 * Endpoint: /coins/{id}/ohlc
 * Days: 1, 7, 14, 30, 90, 180, 365
 */
export async function getOHLC(
  coinId: string,
  days: 1 | 7 | 14 | 30 | 90 | 180 | 365 = 7
): Promise<number[][] | null> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      {
        headers: getHeaders(),
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!res.ok) {
      console.error(`[CoinGecko] OHLC fetch failed: ${res.status}`);
      return null;
    }

    // Returns [[timestamp, open, high, low, close], ...]
    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] OHLC fetch error:', error);
    return null;
  }
}

/**
 * Get detailed coin info
 * Endpoint: /coins/{id}
 */
export async function getCoinDetail(coinId: string): Promise<any | null> {
  try {
    const params = new URLSearchParams({
      localization: 'false',
      tickers: 'false',
      market_data: 'true',
      community_data: 'false',
      developer_data: 'false',
    });

    const res = await fetch(`${getBaseUrl()}/coins/${coinId}?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Coin detail error:', error);
    return null;
  }
}

/**
 * Get global crypto market data
 * Endpoint: /global
 */
export async function getGlobalData(): Promise<{
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
} | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/global`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
  } catch (error) {
    console.error('[CoinGecko] Global data error:', error);
    return null;
  }
}

/**
 * Search for coins by name or symbol
 * Endpoint: /search
 */
export async function searchCoins(query: string): Promise<{
  coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number }>;
} | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/search?query=${encodeURIComponent(query)}`, {
      headers: getHeaders(),
      next: { revalidate: 600 }, // Cache for 10 minutes
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Search error:', error);
    return null;
  }
}

/**
 * Convert symbol to CoinGecko ID
 */
export function symbolToId(symbol: string): string | null {
  const normalized = symbol.toUpperCase().replace('-USD', '').replace('/USD', '');
  return COINGECKO_ID_MAP[normalized] || null;
}

/**
 * Get price for a single symbol
 * Helper function that handles symbol mapping
 */
export async function getPriceBySymbol(symbol: string): Promise<{
  price: number;
  change24h: number;
} | null> {
  const coinId = symbolToId(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] Unknown symbol: ${symbol}`);
    return null;
  }

  const prices = await getSimplePrices([coinId], { include_24h_change: true });
  if (!prices || !prices[coinId]) return null;

  return {
    price: prices[coinId].usd,
    change24h: prices[coinId].usd_24h_change ?? 0,
  };
}

/**
 * Get prices for multiple symbols
 * Batched API call - very efficient
 */
export async function getPricesBySymbols(symbols: string[]): Promise<Record<string, {
  price: number;
  change24h: number;
}>> {
  const symbolToIdMap: Record<string, string> = {};
  const ids: string[] = [];

  for (const symbol of symbols) {
    const coinId = symbolToId(symbol);
    if (coinId) {
      symbolToIdMap[symbol] = coinId;
      if (!ids.includes(coinId)) {
        ids.push(coinId);
      }
    }
  }

  if (ids.length === 0) return {};

  const prices = await getSimplePrices(ids, { include_24h_change: true });
  if (!prices) return {};

  const result: Record<string, { price: number; change24h: number }> = {};
  for (const [symbol, coinId] of Object.entries(symbolToIdMap)) {
    if (prices[coinId]) {
      result[symbol] = {
        price: prices[coinId].usd,
        change24h: prices[coinId].usd_24h_change ?? 0,
      };
    }
  }

  return result;
}

// ============================================
// DERIVATIVES DATA (Funding Rates, OI, Volume)
// ============================================

export interface DerivativeTicker {
  market: string;           // Exchange name e.g. "Binance (Futures)"
  symbol: string;           // e.g. "BTCUSDT"
  index_id: string;         // e.g. "BTC"
  price: string;            // Current price
  price_percentage_change_24h: number;
  contract_type: string;    // "perpetual" or "futures"
  index: number;            // Underlying asset price
  basis: number;            // Difference between derivative and index
  spread: number;           // Bid-ask spread
  funding_rate: number;     // Funding rate (as decimal, e.g. 0.0001 = 0.01%)
  open_interest: number;    // Open interest in USD
  volume_24h: number;       // 24h volume in USD
  last_traded_at: number;   // Unix timestamp
  expired_at: string | null;
}

/**
 * Get all derivatives tickers across exchanges
 * Endpoint: /derivatives
 * Returns funding rates, open interest, volume for all perpetual contracts
 * Note: This endpoint returns ~9MB of data, so we use cache: 'no-store' to skip Next.js data cache
 * and rely on our own in-memory caching in the API routes
 */
export async function getDerivativesTickers(): Promise<DerivativeTicker[] | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/derivatives`, {
      headers: getHeaders(),
      cache: 'no-store', // Skip Next.js cache (response is >2MB limit)
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Derivatives fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Derivatives fetch error:', error);
    return null;
  }
}

/**
 * Get derivatives data for specific symbols from a specific exchange
 * Filters the full derivatives list for better performance
 */
export async function getDerivativesForSymbols(
  symbols: string[],
  exchange?: string // e.g. "binance_futures", "bybit"
): Promise<DerivativeTicker[]> {
  const allTickers = await getDerivativesTickers();
  if (!allTickers) return [];

  const normalizedSymbols = symbols.map(s => s.toUpperCase().replace('USDT', ''));
  
  return allTickers.filter(ticker => {
    const matchesSymbol = normalizedSymbols.includes(ticker.index_id.toUpperCase());
    const matchesExchange = !exchange || ticker.market.toLowerCase().includes(exchange.toLowerCase());
    const isPerpetual = ticker.contract_type === 'perpetual';
    return matchesSymbol && matchesExchange && isPerpetual;
  });
}

/**
 * Get aggregated funding rates for top coins
 * Aggregates data from multiple exchanges for a single coin
 */
export async function getAggregatedFundingRates(symbols: string[]): Promise<{
  symbol: string;
  avgFundingRate: number;
  fundingRatePercent: number;
  annualized: number;
  exchanges: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
}[]> {
  const tickers = await getDerivativesForSymbols(symbols);
  if (!tickers.length) return [];

  // Group by index_id (e.g., BTC, ETH)
  const grouped: Record<string, DerivativeTicker[]> = {};
  for (const ticker of tickers) {
    const sym = ticker.index_id.toUpperCase();
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push(ticker);
  }

  return Object.entries(grouped).map(([symbol, exchanges]) => {
    // Average funding rate across exchanges
    const rates = exchanges.map(e => e.funding_rate).filter(r => r !== null && !isNaN(r));
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const ratePercent = avgRate * 100;
    const annualized = ratePercent * 3 * 365; // 3 funding periods per day

    let sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (ratePercent > 0.03) sentiment = 'Bullish';
    else if (ratePercent < -0.01) sentiment = 'Bearish';
    else sentiment = 'Neutral';

    return {
      symbol,
      avgFundingRate: avgRate,
      fundingRatePercent: ratePercent,
      annualized,
      exchanges: exchanges.length,
      sentiment,
    };
  });
}

/**
 * Get aggregated open interest for top coins
 */
export async function getAggregatedOpenInterest(symbols: string[]): Promise<{
  symbol: string;
  totalOpenInterest: number;
  exchanges: number;
  avgVolume24h: number;
}[]> {
  const tickers = await getDerivativesForSymbols(symbols);
  if (!tickers.length) return [];

  // Group by index_id
  const grouped: Record<string, DerivativeTicker[]> = {};
  for (const ticker of tickers) {
    const sym = ticker.index_id.toUpperCase();
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push(ticker);
  }

  return Object.entries(grouped).map(([symbol, exchanges]) => {
    const totalOI = exchanges.reduce((sum, e) => sum + (e.open_interest || 0), 0);
    const totalVolume = exchanges.reduce((sum, e) => sum + (e.volume_24h || 0), 0);

    return {
      symbol,
      totalOpenInterest: totalOI,
      exchanges: exchanges.length,
      avgVolume24h: totalVolume,
    };
  });
}

/**
 * Get list of derivatives exchanges
 * Endpoint: /derivatives/exchanges/list
 */
export async function getDerivativesExchanges(): Promise<{ id: string; name: string }[] | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/derivatives/exchanges/list`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Derivatives exchanges error:', error);
    return null;
  }
}

// ============================================
// TRENDING & TOP MOVERS (Analyst Plan Features)
// ============================================

export interface TrendingCoin {
  id: string;
  coin_id: number;
  name: string;
  symbol: string;
  market_cap_rank: number;
  thumb: string;
  small: string;
  large: string;
  slug: string;
  price_btc: number;
  score: number;
  data?: {
    price: number;
    price_change_percentage_24h: { usd: number };
    market_cap: string;
    total_volume: string;
    sparkline: string;
  };
}

export interface TrendingResponse {
  coins: { item: TrendingCoin }[];
  nfts?: { id: string; name: string; symbol: string; thumb: string }[];
  categories?: { id: number; name: string; market_cap_1h_change: number }[];
}

/**
 * Get trending coins in the last 24 hours
 * Endpoint: /search/trending
 * FREE - No Analyst plan required
 */
export async function getTrendingCoins(): Promise<TrendingResponse | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/search/trending`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Trending fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Trending fetch error:', error);
    return null;
  }
}

export interface TopMover {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

/**
 * Get top gainers and losers (💼 Analyst Plan)
 * Endpoint: /coins/top_gainers_losers
 * Duration: 1h, 24h, 7d, 14d, 30d, 60d, 1y
 */
export async function getTopGainersLosers(
  duration: '1h' | '24h' | '7d' | '14d' | '30d' | '60d' | '1y' = '24h',
  topCoins: 'all' | '300' | '500' | '1000' = '1000'
): Promise<{ top_gainers: TopMover[]; top_losers: TopMover[] } | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      duration,
      top_coins: topCoins,
    });

    const res = await fetch(`${getBaseUrl()}/coins/top_gainers_losers?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Top gainers/losers fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Top gainers/losers fetch error:', error);
    return null;
  }
}

export interface NewListing {
  id: string;
  symbol: string;
  name: string;
  activated_at: number; // Unix timestamp
}

/**
 * Get newly listed coins (💼 Analyst Plan)
 * Endpoint: /coins/list/new
 * Returns latest 200 coins
 */
export async function getNewListings(): Promise<NewListing[] | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/coins/list/new`, {
      headers: getHeaders(),
      next: { revalidate: 600 }, // Cache for 10 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] New listings fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] New listings fetch error:', error);
    return null;
  }
}

// ============================================
// CATEGORIES / SECTORS
// ============================================

export interface CoinCategory {
  id: string;
  name: string;
  market_cap: number;
  market_cap_change_24h: number;
  volume_24h: number;
  top_3_coins: string[];
  updated_at: string;
}

/**
 * Get all coin categories with market data
 * Endpoint: /coins/categories
 * FREE - Returns DeFi, Layer 2, Meme, AI, etc.
 */
export async function getCoinCategories(): Promise<CoinCategory[] | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/coins/categories?order=market_cap_desc`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Categories fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Categories fetch error:', error);
    return null;
  }
}

// ============================================
// DeFi DATA
// ============================================

export interface DefiData {
  defi_market_cap: string;
  eth_market_cap: string;
  defi_to_eth_ratio: string;
  trading_volume_24h: string;
  defi_dominance: string;
  top_coin_name: string;
  top_coin_defi_dominance: number;
}

/**
 * Get global DeFi market data
 * Endpoint: /global/decentralized_finance_defi
 * FREE
 */
export async function getDefiData(): Promise<DefiData | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/global/decentralized_finance_defi`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] DeFi data fetch failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.data;
  } catch (error) {
    console.error('[CoinGecko] DeFi data fetch error:', error);
    return null;
  }
}

// ============================================
// HISTORICAL MARKET CAP (💼 Analyst Plan)
// ============================================

/**
 * Get historical global market cap chart
 * Endpoint: /global/market_cap_chart (💼 Analyst Plan)
 * Returns [timestamp, market_cap] pairs
 */
export async function getGlobalMarketCapChart(
  days: number = 30
): Promise<{ market_cap_chart: { market_cap: [number, number][] } } | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/global/market_cap_chart?days=${days}`, {
      headers: getHeaders(),
      next: { revalidate: 600 }, // Cache for 10 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Global market cap chart fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Global market cap chart fetch error:', error);
    return null;
  }
}

// ============================================
// ONCHAIN DEX (GeckoTerminal)
// ============================================

export interface TrendingPool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    base_token_price_native_currency: string;
    price_change_percentage: {
      h1: string;
      h24: string;
    };
    transactions: {
      h1: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume_usd: {
      h1: string;
      h24: string;
    };
    reserve_in_usd: string;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    network: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

/**
 * Get trending DEX pools across all networks
 * Endpoint: /onchain/networks/trending_pools
 * FREE
 */
export async function getTrendingPools(): Promise<{ data: TrendingPool[] } | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/onchain/networks/trending_pools`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] Trending pools fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] Trending pools fetch error:', error);
    return null;
  }
}

/**
 * Get newly created DEX pools
 * Endpoint: /onchain/networks/new_pools
 * FREE
 */
export async function getNewPools(): Promise<{ data: TrendingPool[] } | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/onchain/networks/new_pools`, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[CoinGecko] New pools fetch failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('[CoinGecko] New pools fetch error:', error);
    return null;
  }
}
