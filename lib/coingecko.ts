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

// Read API key lazily so dotenv/Render env vars are available at call time
const getApiKey = () => process.env.COINGECKO_API_KEY || '';
const BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const FREE_URL = 'https://api.coingecko.com/api/v3';

// Use Pro API if key is available, otherwise fall back to free tier
const getBaseUrl = () => getApiKey() ? BASE_URL : FREE_URL;

// Circuit breaker — trips after repeated non-429 failures (500s, timeouts)
import { coinGeckoCircuit } from '@/lib/circuitBreaker';

// Request headers with API key
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  const key = getApiKey();
  if (key) {
    headers['x-cg-pro-api-key'] = key;
  }
  return headers;
};

const DERIVATIVES_CACHE_TTL_MS = 45_000;
const SYMBOL_RESOLUTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// CoinGecko daily budget tracking removed — usage is monitored via CoinGecko dashboard directly.

let derivativesCache: { value: DerivativeTicker[]; fetchedAt: number } | null = null;
let derivativesInFlight: Promise<DerivativeTicker[] | null> | null = null;

const symbolResolutionCache = new Map<string, { id: string | null; expiresAt: number }>();
const symbolResolutionInFlight = new Map<string, Promise<string | null>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCoinGeckoUrl(path: string, params?: URLSearchParams): string {
  const base = getBaseUrl();
  const url = new URL(`${base}${path}`);

  if (params) {
    url.search = params.toString();
  }

  // B14 FIX: API key sent via header only (was also in URL, leaking to logs/CDN)
  // URL parameter removed — cgFetch sends key in x-cg-pro-api-key header
  return url.toString();
}

async function cgFetch<T>(
  path: string,
  options?: {
    params?: URLSearchParams;
    init?: RequestInit;
    retries?: number;
    timeoutMs?: number;
  }
): Promise<T> {
  const url = buildCoinGeckoUrl(path, options?.params);
  const retries = options?.retries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 12_000;

  const execute = async (remainingRetries: number): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await coinGeckoCircuit.call(() => fetch(url, {
        ...(options?.init || {}),
        headers: {
          ...getHeaders(),
          ...(options?.init?.headers || {}),
        },
        signal: controller.signal,
      }));

      if (response.status === 429 && remainingRetries > 0) {
        const retryAfterSeconds = Number(response.headers.get('retry-after') || '0');
        const jitterMs = Math.floor(Math.random() * 250);
        const backoffMs = retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : (4 - remainingRetries) * 500 + jitterMs;
        await sleep(backoffMs);
        return execute(remainingRetries - 1);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const statusError = new Error(
          `[CoinGecko] ${response.status} ${response.statusText} :: ${body.slice(0, 300)}`
        );
        if (response.status >= 500 && remainingRetries > 0) {
          const jitterMs = Math.floor(Math.random() * 250);
          await sleep((4 - remainingRetries) * 500 + jitterMs);
          return execute(remainingRetries - 1);
        }
        throw statusError;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (remainingRetries > 0) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes('aborted') ||
          message.includes('fetch failed') ||
          message.includes('network') ||
          message.includes('ECONNRESET') ||
          message.includes('ETIMEDOUT');
        if (retryable) {
          const jitterMs = Math.floor(Math.random() * 250);
          await sleep((4 - remainingRetries) * 500 + jitterMs);
          return execute(remainingRetries - 1);
        }
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  return execute(retries);
}

function normalizeSymbol(symbol: string): string {
  return symbol
    .toUpperCase()
    .trim()
    .replace(/[-_/]/g, '')
    .replace(/USDT$/, '')
    .replace(/USDC$/, '')
    .replace(/USD$/, '');
}

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
  'BCH': 'bitcoin-cash',
  'BCHUSDT': 'bitcoin-cash',
  'HBAR': 'hedera-hashgraph',
  'HBARUSDT': 'hedera-hashgraph',
  'TON': 'the-open-network',
  'TONUSDT': 'the-open-network',
  'APT': 'aptos',
  'APTUSDT': 'aptos',
  'ARB': 'arbitrum',
  'ARBUSDT': 'arbitrum',
  'OP': 'optimism',
  'OPUSDT': 'optimism',
  // Special tokens
  'JUP': 'jupiter-exchange-solana',
  'JUPUSDT': 'jupiter-exchange-solana',
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
  // Tier 3 — DeFi & Infra
  'CHR': 'chromaway',
  'HOOK': 'hooked-protocol',
  'MAGIC': 'magic',
  'ARPA': 'arpa',
  'STRK': 'starknet',
  'ZK': 'zksync',
  'SUPER': 'superfarm',
  'RARE': 'superrare',
  'SSV': 'ssv-network',
  'TWT': 'trust-wallet-token',
  'OGN': 'origin-protocol',
  'ALICE': 'my-neighbor-alice',
  'FTM': 'fantom',
  'SNT': 'status',
  'STG': 'stargate-finance',
  'ZRX': '0x',
  'ANKR': 'ankr',
  'SKL': 'skale',
  'CELO': 'celo',
  'HOT': 'holotoken',
  'ENJ': 'enjincoin',
  'KNC': 'kyber-network-crystal',
  'YFI': 'yearn-finance',
  'AUDIO': 'audius',
  'SUSHI': 'sushi',
  'MASK': 'mask-network',
  'BAL': 'balancer',
  'RLC': 'iexec-rlc',
  'BAND': 'band-protocol',
  'ASTR': 'astar',
  'API3': 'api3',
  'GLM': 'golem',
  'UMA': 'uma',
  'DENT': 'dent',
  'STORJ': 'storj',
  'ICX': 'icon',
  'OCEAN': 'ocean-protocol',
  'LRC': 'loopring',
  'ILV': 'illuvium',
  'BLUR': 'blur',
  'CELR': 'celer-network',
  'CTSI': 'cartesi',
  'ORDI': 'ordinals',
  'SFP': 'safepal',
  'C98': 'coin98',
  'JTO': 'jito-governance-token',
  'ZRO': 'layerzero',
  'OM': 'mantra-dao',
  'BICO': 'biconomy',
  'REQ': 'request-network',
  'SPELL': 'spell-token',
  'NKN': 'nkn',
  'SC': 'siacoin',
  'AR': 'arweave',
  'WAVES': 'waves',
  'MINA': 'mina-protocol',
  'HNT': 'helium',
  'CFX': 'conflux-token',
  'FLR': 'flare-networks',
  'WLD': 'worldcoin-wld',
  'SATS': '1000sats',
  'GALA': 'gala',
  'CAKE': 'pancakeswap-token',
  'XDC': 'xdce-crowd-sale',
  'NEXO': 'nexo',
  'VANRY': 'vanar-chain',
  'KSM': 'kusama',
  'SXP': 'swipe',
  'RSR': 'reserve-rights-token',
  'CKB': 'nervos-network',
  'ACH': 'alchemy-pay',
  'TRB': 'tellor',
  'NMR': 'numeraire',
  'FXS': 'frax-share',
  'SLP': 'smooth-love-potion',
  'AMP': 'amp-token',
  'QTUM': 'qtum',
  'ONT': 'ontology',
  'ONE': 'harmony',
  'BAT': 'basic-attention-token',
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
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
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
      include_last_updated_at: 'true',
      precision: 'full',
    });

    return await cgFetch<Record<string, CoinGeckoPrice>>('/simple/price', {
      params,
      init: { next: { revalidate: 30 } },
    });
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
    price_change_percentage?: Array<'1h' | '24h' | '7d' | '14d' | '30d' | '200d' | '1y'>;
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

    if (options?.price_change_percentage?.length) {
      params.set('price_change_percentage', options.price_change_percentage.join(','));
    }

    if (options?.ids?.length) {
      params.set('ids', options.ids.join(','));
    }

    return await cgFetch<CoinGeckoMarketData[]>('/coins/markets', {
      params,
      init: { next: { revalidate: 90 } },
    });
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
  days: 1 | 7 | 14 | 30 | 90 | 180 | 365 = 7,
  requestOptions?: {
    retries?: number;
    timeoutMs?: number;
  }
): Promise<number[][] | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      days: String(days),
    });

    return await cgFetch<number[][]>(`/coins/${coinId}/ohlc`, {
      params,
      init: { next: { revalidate: 300 } },
      retries: requestOptions?.retries,
      timeoutMs: requestOptions?.timeoutMs,
    });
  } catch (error) {
    console.error('[CoinGecko] OHLC fetch error:', error);
    return null;
  }
}

/**
 * Fetch OHLC candles WITH volume data by combining /ohlc + /market_chart endpoints.
 * CoinGecko's /ohlc endpoint returns no volume — this merges volume from /market_chart
 * by matching timestamps (nearest within 2h bucket). Returns candles with real volume.
 */
export async function getOHLCWithVolume(
  coinId: string,
  days: 1 | 7 | 14 | 30 | 90 | 180 | 365 = 7,
  requestOptions?: { retries?: number; timeoutMs?: number }
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[] | null> {
  try {
    // Fetch OHLC and market_chart (which has total_volumes) in parallel
    const [ohlc, chart] = await Promise.all([
      getOHLC(coinId, days, requestOptions),
      cgFetch<{
        prices: [number, number][];
        total_volumes: [number, number][];
      }>(`/coins/${coinId}/market_chart`, {
        params: new URLSearchParams({ vs_currency: 'usd', days: String(days) }),
        init: { next: { revalidate: 300 } },
        retries: requestOptions?.retries,
        timeoutMs: requestOptions?.timeoutMs,
      }),
    ]);

    if (!ohlc || ohlc.length === 0) return null;

    // Build volume lookup from market_chart total_volumes (timestamp → volume)
    // Use sorted array + binary search for O(n log n) instead of O(n²)
    const volEntries: { ts: number; vol: number }[] = [];
    if (chart?.total_volumes) {
      for (const [ts, vol] of chart.total_volumes) {
        if (Number.isFinite(vol) && vol >= 0) {
          volEntries.push({ ts, vol });
        }
      }
      volEntries.sort((a, b) => a.ts - b.ts);
    }

    // Binary search helper: find nearest volume timestamp within window
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    function findNearestVol(targetTs: number): number {
      if (volEntries.length === 0) return 0;
      let lo = 0, hi = volEntries.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (volEntries[mid].ts < targetTs) lo = mid + 1;
        else hi = mid;
      }
      // Check lo and lo-1 for closest
      let bestVol = 0;
      let bestDist = Infinity;
      for (const idx of [lo - 1, lo, lo + 1]) {
        if (idx >= 0 && idx < volEntries.length) {
          const dist = Math.abs(volEntries[idx].ts - targetTs);
          if (dist < bestDist && dist < TWO_HOURS) {
            bestDist = dist;
            bestVol = volEntries[idx].vol;
          }
        }
      }
      return bestVol;
    }

    const merged = ohlc.map((row) => ({
      t: row[0],
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: findNearestVol(row[0]),
    })).filter(c => Number.isFinite(c.c));

    // Volume quality check: warn if >50% of candles have zero volume
    const zeroVolCount = merged.filter(c => c.v === 0).length;
    if (merged.length > 0 && zeroVolCount / merged.length > 0.5) {
      console.warn(
        `[CoinGecko] Volume quality warning for ${coinId}: ${zeroVolCount}/${merged.length} candles have zero volume`
      );
    }

    return merged;
  } catch (error) {
    console.error('[CoinGecko] OHLC+Volume fetch error:', error);
    return null;
  }
}

export async function getOHLCRange(
  coinId: string,
  fromUnixSeconds: number,
  toUnixSeconds: number,
  requestOptions?: {
    retries?: number;
    timeoutMs?: number;
  }
): Promise<number[][] | null> {
  try {
    const from = Math.floor(fromUnixSeconds);
    const to = Math.floor(toUnixSeconds);

    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0 || from >= to) {
      return null;
    }

    const params = new URLSearchParams({
      vs_currency: 'usd',
      from: String(from),
      to: String(to),
      interval: 'daily',
    });

    return await cgFetch<number[][]>(`/coins/${coinId}/ohlc/range`, {
      params,
      init: { next: { revalidate: 900 } },
      retries: requestOptions?.retries,
      timeoutMs: requestOptions?.timeoutMs,
    });
  } catch (error) {
    console.error('[CoinGecko] OHLC range fetch error:', error);
    return null;
  }
}

export async function getMarketChartHistory(
  coinId: string,
  days: number | 'max' = 'max',
  requestOptions?: {
    retries?: number;
    timeoutMs?: number;
  }
): Promise<{ prices: [number, number][] } | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      days: String(days),
      interval: 'daily',
    });

    return await cgFetch<{ prices: [number, number][] }>(`/coins/${coinId}/market_chart`, {
      params,
      init: { next: { revalidate: 900 } },
      retries: requestOptions?.retries,
      timeoutMs: requestOptions?.timeoutMs,
    });
  } catch (error) {
    console.error('[CoinGecko] Market chart history fetch error:', error);
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

    return await cgFetch<any>(`/coins/${coinId}`, {
      params,
      init: { next: { revalidate: 300 } },
    });
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
    const data = await cgFetch<{ data: {
      total_market_cap: Record<string, number>;
      total_volume: Record<string, number>;
      market_cap_percentage: Record<string, number>;
      market_cap_change_percentage_24h_usd: number;
    } }>('/global', {
      init: { next: { revalidate: 300 } },
    });
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
    const params = new URLSearchParams({ query });
    return await cgFetch<{ coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number }> }>('/search', {
      params,
      init: { next: { revalidate: 600 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Search error:', error);
    return null;
  }
}

/**
 * Convert symbol to CoinGecko ID
 */
export function symbolToId(symbol: string): string | null {
  const normalized = normalizeSymbol(symbol);
  return COINGECKO_ID_MAP[normalized] || null;
}

function selectBestSearchMatch(
  symbol: string,
  matches: Array<{ id: string; name: string; symbol: string; market_cap_rank: number }>
): string | null {
  if (!matches.length) return null;

  const normalized = normalizeSymbol(symbol);
  const scored = matches.map((item) => {
    const itemSymbol = normalizeSymbol(item.symbol);
    const exactSymbol = itemSymbol === normalized ? 1 : 0;
    const exactName = item.name.toUpperCase() === symbol.toUpperCase() ? 1 : 0;
    const rankScore = item.market_cap_rank && item.market_cap_rank > 0
      ? Math.max(0, 10_000 - item.market_cap_rank)
      : 0;
    return {
      id: item.id,
      score: exactSymbol * 1_000_000 + exactName * 100_000 + rankScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id || null;
}

export async function resolveSymbolToId(symbol: string): Promise<string | null> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;

  const staticId = COINGECKO_ID_MAP[normalized];
  if (staticId) return staticId;

  const now = Date.now();
  const cached = symbolResolutionCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.id;
  }

  const inFlight = symbolResolutionInFlight.get(normalized);
  if (inFlight) return inFlight;

  const resolverPromise = (async () => {
    const search = await searchCoins(normalized);
    const bestId = search?.coins?.length
      ? selectBestSearchMatch(normalized, search.coins)
      : null;

    symbolResolutionCache.set(normalized, {
      id: bestId,
      expiresAt: now + SYMBOL_RESOLUTION_CACHE_TTL_MS,
    });

    return bestId;
  })();

  symbolResolutionInFlight.set(normalized, resolverPromise);

  try {
    return await resolverPromise;
  } finally {
    symbolResolutionInFlight.delete(normalized);
  }
}

/**
 * Get price for a single symbol
 * Helper function that handles symbol mapping
 */
export async function getPriceBySymbol(symbol: string): Promise<{
  price: number;
  change24h: number;
} | null> {
  const coinId = await resolveSymbolToId(symbol);
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
    const coinId = await resolveSymbolToId(symbol);
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
  const now = Date.now();
  if (derivativesCache && now - derivativesCache.fetchedAt < DERIVATIVES_CACHE_TTL_MS) {
    return derivativesCache.value;
  }

  if (derivativesInFlight) {
    return derivativesInFlight;
  }

  derivativesInFlight = (async () => {
    try {
      const data = await cgFetch<DerivativeTicker[]>('/derivatives', {
        init: { cache: 'no-store' },
        retries: 2,
        timeoutMs: 15_000,
      });

      derivativesCache = {
        value: data,
        fetchedAt: Date.now(),
      };

      return data;
    } catch (error) {
      console.error('[CoinGecko] Derivatives fetch error:', error);
      return derivativesCache?.value ?? null;
    } finally {
      derivativesInFlight = null;
    }
  })();

  try {
    return await derivativesInFlight;
  } catch (error) {
    console.error('[CoinGecko] Derivatives fetch error:', error);
    return null;
  }
}

export async function warmDerivativesCache(): Promise<void> {
  await getDerivativesTickers();
}

export function invalidateDerivativesCache(): void {
  derivativesCache = null;
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
    return await cgFetch<{ id: string; name: string }[]>('/derivatives/exchanges/list', {
      init: { next: { revalidate: 300 } },
    });
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
    return await cgFetch<TrendingResponse>('/search/trending', {
      init: { next: { revalidate: 300 } },
    });
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
  // CoinGecko top_gainers_losers uses different field names
  usd?: number;  // Current price
  usd_24h_vol?: number;  // Volume
  usd_24h_change?: number;  // Price change % for the selected duration
  usd_market_cap?: number;  // Market cap
  market_cap_rank?: number;
  // Legacy fields for backward compatibility
  current_price?: number;
  market_cap?: number;
  price_change_percentage_24h?: number;
  total_volume?: number;
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

    return await cgFetch<{ top_gainers: TopMover[]; top_losers: TopMover[] }>('/coins/top_gainers_losers', {
      params,
      init: { next: { revalidate: 300 } },
    });
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
    return await cgFetch<NewListing[]>('/coins/list/new', {
      init: { next: { revalidate: 600 } },
    });
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
    const params = new URLSearchParams({ order: 'market_cap_desc' });
    return await cgFetch<CoinCategory[]>('/coins/categories', {
      params,
      init: { next: { revalidate: 300 } },
    });
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
    const data = await cgFetch<{ data: DefiData }>('/global/decentralized_finance_defi', {
      init: { next: { revalidate: 300 } },
    });
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
    const params = new URLSearchParams({ days: String(days) });
    return await cgFetch<{ market_cap_chart: { market_cap: [number, number][] } }>('/global/market_cap_chart', {
      params,
      init: { next: { revalidate: 600 } },
    });
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
    return await cgFetch<{ data: TrendingPool[] }>('/onchain/networks/trending_pools', {
      init: { next: { revalidate: 300 } },
    });
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
    return await cgFetch<{ data: TrendingPool[] }>('/onchain/networks/new_pools', {
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] New pools fetch error:', error);
    return null;
  }
}

// ============================================
// COIN TICKERS (Where to Trade)
// ============================================

export interface CoinTicker {
  base: string;
  target: string;
  market: { name: string; identifier: string; has_trading_incentive: boolean };
  last: number;
  volume: number;
  converted_last: { btc: number; eth: number; usd: number };
  converted_volume: { btc: number; eth: number; usd: number };
  trust_score: 'green' | 'yellow' | 'red' | null;
  bid_ask_spread_percentage: number | null;
  timestamp: string;
  last_traded_at: string;
  last_fetch_at: string;
  is_anomaly: boolean;
  is_stale: boolean;
  trade_url: string | null;
  coin_id: string;
  target_coin_id?: string;
}

/**
 * Get exchange tickers for a coin (where to trade, spreads, trust)
 * Endpoint: /coins/{id}/tickers
 * FREE — returns paginated tickers across all exchanges
 */
export async function getCoinTickers(
  coinId: string,
  options?: { exchange_ids?: string; include_exchange_logo?: boolean; page?: number; depth?: boolean }
): Promise<{ tickers: CoinTicker[] } | null> {
  try {
    const params = new URLSearchParams({ include_exchange_logo: 'true', depth: 'true' });
    if (options?.exchange_ids) params.set('exchange_ids', options.exchange_ids);
    if (options?.page) params.set('page', String(options.page));
    return await cgFetch<{ tickers: CoinTicker[] }>(`/coins/${coinId}/tickers`, {
      params,
      init: { next: { revalidate: 120 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Coin tickers error:', error);
    return null;
  }
}

// ============================================
// PUBLIC TREASURY (BTC/ETH Holdings)
// ============================================

export interface PublicTreasuryCompany {
  name: string;
  symbol: string;
  country: string;
  total_holdings: number;
  total_entry_value_usd: number;
  total_current_value_usd: number;
  percentage_of_total_supply: number;
}

export interface PublicTreasuryData {
  total_holdings: number;
  total_value_usd: number;
  market_cap_dominance: number;
  companies: PublicTreasuryCompany[];
}

/**
 * Get public companies' crypto holdings (BTC or ETH)
 * Endpoint: /companies/public_treasury/{coin_id}
 * FREE — returns MicroStrategy, Tesla, etc.
 */
export async function getPublicTreasury(
  coinId: 'bitcoin' | 'ethereum'
): Promise<PublicTreasuryData | null> {
  try {
    return await cgFetch<PublicTreasuryData>(`/companies/public_treasury/${coinId}`, {
      init: { next: { revalidate: 600 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Public treasury error:', error);
    return null;
  }
}

// ============================================
// EXCHANGE RATES (BTC → Fiat)
// ============================================

export interface ExchangeRates {
  rates: Record<string, { name: string; unit: string; value: number; type: 'fiat' | 'crypto' | 'commodity' }>;
}

/**
 * Get BTC exchange rates vs all fiat/crypto currencies
 * Endpoint: /exchange_rates
 * FREE — ~60 currencies
 */
export async function getExchangeRates(): Promise<ExchangeRates | null> {
  try {
    return await cgFetch<ExchangeRates>('/exchange_rates', {
      init: { next: { revalidate: 120 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Exchange rates error:', error);
    return null;
  }
}

// ============================================
// EXCHANGES (CEX Rankings)
// ============================================

export interface ExchangeInfo {
  id: string;
  name: string;
  year_established: number | null;
  country: string | null;
  description: string;
  url: string;
  image: string;
  has_trading_incentive: boolean;
  trust_score: number;
  trust_score_rank: number;
  trade_volume_24h_btc: number;
  trade_volume_24h_btc_normalized: number;
}

/**
 * Get top exchanges ranked by trust score and volume
 * Endpoint: /exchanges
 * FREE — paginated, 100 per page
 */
export async function getExchanges(
  options?: { per_page?: number; page?: number }
): Promise<ExchangeInfo[] | null> {
  try {
    const params = new URLSearchParams({
      per_page: String(options?.per_page ?? 50),
      page: String(options?.page ?? 1),
    });
    return await cgFetch<ExchangeInfo[]>('/exchanges', {
      params,
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Exchanges list error:', error);
    return null;
  }
}

/**
 * Get detailed exchange data including tickers
 * Endpoint: /exchanges/{id}
 * FREE
 */
export async function getExchangeDetail(exchangeId: string): Promise<any | null> {
  try {
    return await cgFetch<any>(`/exchanges/${exchangeId}`, {
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Exchange detail error:', error);
    return null;
  }
}

// ============================================
// HISTORICAL COIN DATA (Snapshot at Date)
// ============================================

/**
 * Get coin snapshot at a specific date
 * Endpoint: /coins/{id}/history
 * FREE — date format dd-mm-yyyy
 */
export async function getCoinHistory(
  coinId: string,
  date: string // dd-mm-yyyy
): Promise<any | null> {
  try {
    const params = new URLSearchParams({ date, localization: 'false' });
    return await cgFetch<any>(`/coins/${coinId}/history`, {
      params,
      init: { next: { revalidate: 3600 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Coin history error:', error);
    return null;
  }
}

// ============================================
// MARKET CHART RANGE (Arbitrary Date Range)
// ============================================

/**
 * Get historical chart data for an arbitrary date range
 * Endpoint: /coins/{id}/market_chart/range
 * FREE — returns price, market_cap, total_volumes
 */
export async function getMarketChartRange(
  coinId: string,
  fromUnixSeconds: number,
  toUnixSeconds: number
): Promise<{
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
} | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      from: String(Math.floor(fromUnixSeconds)),
      to: String(Math.floor(toUnixSeconds)),
    });
    return await cgFetch<{
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    }>(`/coins/${coinId}/market_chart/range`, {
      params,
      init: { next: { revalidate: 900 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Market chart range error:', error);
    return null;
  }
}

// ============================================
// COIN DETAIL (Extended — with tickers, dev data, sparkline)
// ============================================

/**
 * Get full coin detail including tickers, developer data, sparkline
 * Endpoint: /coins/{id} (with all optional fields)
 * FREE
 */
export async function getCoinDetailFull(coinId: string): Promise<any | null> {
  try {
    const params = new URLSearchParams({
      localization: 'false',
      tickers: 'true',
      market_data: 'true',
      community_data: 'false',
      developer_data: 'true',
      sparkline: 'true',
    });
    return await cgFetch<any>(`/coins/${coinId}`, {
      params,
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Coin detail full error:', error);
    return null;
  }
}

// ============================================
// MARKET CHART (Full — with volumes & market caps)
// ============================================

/**
 * Get market chart with prices, market caps, and volumes
 * Endpoint: /coins/{id}/market_chart (full response)
 * FREE
 */
export async function getMarketChartFull(
  coinId: string,
  days: number = 30
): Promise<{
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
} | null> {
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      days: String(days),
    });
    return await cgFetch<{
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    }>(`/coins/${coinId}/market_chart`, {
      params,
      init: { next: { revalidate: 60 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Market chart full error:', error);
    return null;
  }
}

// ============================================
// API USAGE (💼 Analyst Plan)
// ============================================

/**
 * Check API key usage stats
 * Endpoint: /key (💼 Analyst Plan)
 * Returns monthly usage, remaining credits, plan info
 */
export async function getApiUsage(): Promise<any | null> {
  try {
    return await cgFetch<any>('/key', {
      init: { next: { revalidate: 60 } },
    });
  } catch (error) {
    console.error('[CoinGecko] API usage error:', error);
    return null;
  }
}

// ============================================
// DERIVATIVES EXCHANGES (with data)
// ============================================

export interface DerivativesExchangeData {
  name: string;
  id: string;
  open_interest_btc: number;
  trade_volume_24h_btc: string;
  number_of_perpetual_pairs: number;
  number_of_futures_pairs: number;
  image: string;
  year_established: number | null;
  country: string | null;
  description: string;
  url: string;
}

/**
 * Get derivatives exchanges with OI, volume, pair counts
 * Endpoint: /derivatives/exchanges (with full data)
 * FREE
 */
export async function getDerivativesExchangesData(
  options?: { per_page?: number; page?: number }
): Promise<DerivativesExchangeData[] | null> {
  try {
    const params = new URLSearchParams({
      per_page: String(options?.per_page ?? 50),
      page: String(options?.page ?? 1),
      order: 'open_interest_btc_desc',
    });
    return await cgFetch<DerivativesExchangeData[]>('/derivatives/exchanges', {
      params,
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Derivatives exchanges data error:', error);
    return null;
  }
}

// ============================================
// CRYPTO NEWS (Analyst Plan)
// ============================================

export interface CryptoNewsItem {
  title: string;
  url: string;
  image: string;
  author: string;
  posted_at: string;
  type: 'news' | 'guides';
  source_name: string;
  related_coin_ids: string[];
}

/**
 * Get latest crypto news from CoinGecko.
 * Endpoint: /news
 */
export async function getCryptoNews(options?: {
  coin_id?: string;
  language?: string;
  type?: 'news' | 'guides';
  page?: number;
  per_page?: number;
}): Promise<CryptoNewsItem[] | null> {
  try {
    const params = new URLSearchParams();
    if (options?.coin_id) params.set('coin_id', options.coin_id);
    if (options?.language) params.set('language', options.language);
    if (options?.type) params.set('type', options.type);
    if (options?.page) params.set('page', String(options.page));
    if (options?.per_page) params.set('per_page', String(options.per_page));
    return await cgFetch<CryptoNewsItem[]>('/news', {
      params,
      init: { next: { revalidate: 300 } },
    });
  } catch (error) {
    console.error('[CoinGecko] Crypto news error:', error);
    return null;
  }
}

// ============================================
// TOKEN INFO - GT Score, Honeypot, Security (Analyst Plan)
// ============================================

export interface TokenInfo {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    image_url: string | null;
    image?: {
      thumb?: string;
      small?: string;
      large?: string;
    };
    coingecko_coin_id: string | null;
    websites: string[];
    discord_url: string | null;
    farcaster_url: string | null;
    zora_url: string | null;
    telegram_handle: string | null;
    twitter_handle: string | null;
    description: string | null;
    gt_score: number | null;
    gt_score_details: {
      pool: number;
      transaction: number;
      creation: number;
      info: number;
      holders: number;
    } | null;
    gt_verified: boolean;
    categories: string[];
    gt_category_ids: string[];
    holders: {
      count: number;
      distribution_percentage: {
        top_10: string;
        [key: string]: string;
      };
      last_updated: string;
    } | null;
    mint_authority: string | null;
    freeze_authority: string | null;
    is_honeypot: boolean | null;
  };
}

/**
 * Get token security info: GT Score, honeypot status, mint/freeze authority.
 * Endpoint: /onchain/networks/{network}/tokens/{address}/info
 */
export async function getTokenInfo(
  network: string,
  address: string
): Promise<TokenInfo | null> {
  try {
    const data = await cgFetch<{ data: TokenInfo }>(
      `/onchain/networks/${network}/tokens/${address}/info`,
      { init: { next: { revalidate: 60 } } }
    );
    return data.data ?? null;
  } catch (error) {
    console.error('[CoinGecko] Token info error:', error);
    return null;
  }
}

// ============================================
// TOP TRADERS / WHALE TRACKER (Analyst Plan)
// ============================================

export interface TopTrader {
  address: string;
  name: string | null;
  label: string | null;
  type: string;
  realized_pnl_usd: string;
  unrealized_pnl_usd: string;
  token_balance: string;
  average_buy_price_usd: string;
  average_sell_price_usd: string | null;
  total_buy_count: number;
  total_sell_count: number;
  total_buy_token_amount: string;
  total_sell_token_amount: string;
  total_buy_usd: string;
  total_sell_usd: string;
  explorer_url: string;
}

/**
 * Get top traders for a token with realized/unrealized PnL.
 * Endpoint: /onchain/networks/{network}/tokens/{address}/traders
 */
export async function getTopTraders(
  network: string,
  address: string,
  options?: { period?: '5m' | '1h' | '6h' | '24h' }
): Promise<TopTrader[] | null> {
  try {
    const params = new URLSearchParams();
    if (options?.period) params.set('period', options.period);
    const data = await cgFetch<{
      data: { id: string; type: string; attributes: { traders: TopTrader[] } };
    }>(`/onchain/networks/${network}/tokens/${address}/traders`, {
      params,
      init: { next: { revalidate: 60 } },
    });
    return data.data?.attributes?.traders ?? null;
  } catch (error) {
    console.error('[CoinGecko] Top traders error:', error);
    return null;
  }
}

// ============================================
// POOL WITH VOLUME BREAKDOWN (Buy/Sell pressure)
// ============================================

export interface PoolVolumeBreakdown {
  volume_breakdown?: {
    m5?: { buys?: string; sells?: string };
    m15?: { buys?: string; sells?: string };
    m30?: { buys?: string; sells?: string };
    h1?: { buys?: string; sells?: string };
    h6?: { buys?: string; sells?: string };
    h24?: { buys?: string; sells?: string };
  };
  net_buy_volume_usd?: {
    m5?: string; m15?: string; m30?: string;
    h1?: string; h6?: string; h24?: string;
  };
  buy_volume_usd?: {
    m5?: string; m15?: string; m30?: string;
    h1?: string; h6?: string; h24?: string;
  };
  sell_volume_usd?: {
    m5?: string; m15?: string; m30?: string;
    h1?: string; h6?: string; h24?: string;
  };
}

/**
 * Get pool data with buy/sell volume breakdown.
 * Endpoint: /onchain/networks/{network}/pools/{address}?include_volume_breakdown=true
 */
export async function getPoolWithVolumeBreakdown(
  network: string,
  poolAddress: string
): Promise<(TrendingPool & { attributes: TrendingPool['attributes'] & PoolVolumeBreakdown }) | null> {
  try {
    const params = new URLSearchParams({ include_volume_breakdown: 'true' });
    const data = await cgFetch<{
      data: TrendingPool & { attributes: TrendingPool['attributes'] & PoolVolumeBreakdown };
    }>(`/onchain/networks/${network}/pools/${poolAddress}`, {
      params,
      init: { next: { revalidate: 30 } },
    });
    return data.data ?? null;
  } catch (error) {
    console.error('[CoinGecko] Pool volume breakdown error:', error);
    return null;
  }
}
