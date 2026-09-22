/**
 * Backtest Price-Data Providers
 *
 * Handles fetching from Alpha Vantage (stocks) and CoinGecko (crypto).
 *
 * Audit fixes (2026-02-27):
 *   Daily OHLC shares one split/dividend adjustment basis.
 *   Crypto requires genuine bounded OHLC history; sampled prices are not candles.
 *   Cache – Redis caching (daily 6h, intraday 120s, CoinGecko 300s)
 */

import { logger } from '@/lib/logger';
import { avTakeToken } from '@/lib/avRateGovernor';
import { getOHLCRange, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { getCached, setCached } from '@/lib/redis';
import {
  parseBacktestTimeframe,
  resamplePriceData,
} from '@/lib/backtest/timeframe';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PriceBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PriceData = Record<string, PriceBar>;
export type PriceDataSource = 'alpha_vantage' | 'coingecko';

export interface PriceFetchResult {
  priceData: PriceData;
  source: PriceDataSource;
  /** true when volume is always 0 (CoinGecko OHLC) */
  volumeUnavailable: boolean;
  /** 'adjusted' | 'raw' — which close field was used for equities */
  closeType: 'adjusted' | 'raw' | 'n/a';
}

// ─── Known crypto symbols ─────────────────────────────────────────────────

const KNOWN_CRYPTO = new Set([
  'BTC','ETH','XRP','SOL','ADA','DOGE','DOT','AVAX','MATIC','LINK',
  'UNI','ATOM','LTC','BCH','XLM','ALGO','VET','FIL','AAVE','EOS',
  'XTZ','THETA','XMR','NEO','MKR','COMP','SNX','SUSHI','YFI','CRV',
  'GRT','ENJ','MANA','SAND','AXS','CHZ','HBAR','FTM','NEAR','EGLD',
  'FLOW','ICP','AR','HNT','STX','KSM','ZEC','DASH','WAVES','KAVA',
  'BNB','SHIB','PEPE','WIF','BONK','FLOKI','APE','IMX','OP','ARB',
  'SUI','SEI','TIA','INJ','FET','RNDR','RENDER','JUP','KAS',
  'RUNE','OSMO','CELO','ONE','ZIL','ICX','QTUM','ONT','ZRX','BAT',
]);

export function isCryptoSymbol(symbol: string): boolean {
  return KNOWN_CRYPTO.has(normalizeSymbol(symbol));
}

export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/-?USDT?$/, '');
}

// ─── Cache helpers ────────────────────────────────────────────────────────

const TTL = {
  avDaily: 6 * 3600,       // 6 hours
  avIntraday: 120,          // 2 minutes
  coingecko: 300,           // 5 minutes
} as const;

function cacheKey(provider: string, symbol: string, interval: string, outputsize: string): string {
  return `bt:v3:${provider}:${symbol}:${interval}:${outputsize}`;
}

// ─── Alpha Vantage — Stocks ───────────────────────────────────────────────

/**
 * Max lookback days for intraday compact output.
 * AV compact returns ~100 data points regardless of interval.
 */
const INTRADAY_COMPACT_MAX_DAYS = 5;

export async function fetchStockPriceData(
  symbol: string,
  timeframe: string = 'daily',
): Promise<PriceFetchResult> {
  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) throw new Error(`Unsupported timeframe: ${timeframe}`);

  const isIntraday = parsedTimeframe.kind === 'intraday';
  const interval = parsedTimeframe.alphaInterval || '1min';

  // Backtest needs full intraday history for EMA200 warmup (230+ bars).
  // AV compact only returns ~100 points — always use full for backtests.
  const outputsize = 'full';

  const ck = cacheKey('av', symbol, isIntraday ? interval : 'daily', outputsize);

  // Try cache first
  const cached = await getCached<PriceData>(ck);
  if (cached && Object.keys(cached).length > 0) {
    logger.debug(`[backtest/providers] cache hit ${ck}`);
    const final = applyResample(cached, parsedTimeframe);
    return { priceData: final, source: 'alpha_vantage', volumeUnavailable: false, closeType: 'adjusted' };
  }

  let url: string;
  let timeSeriesKey: string;

  if (!isIntraday) {
    // P0-4: Use DAILY_ADJUSTED and read adjusted close
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
    timeSeriesKey = 'Time Series (Daily)';
  } else {
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&adjusted=true&outputsize=${outputsize}&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
    timeSeriesKey = `Time Series (${interval})`;
  }

  await avTakeToken();
  const response = await fetch(url);
  const data = await response.json();
  const timeSeries = data[timeSeriesKey];

  if (!timeSeries) {
    if (data['Error Message']) throw new Error(`Invalid symbol ${symbol}: ${data['Error Message']}`);
    if (data['Note']) throw new Error('API rate limit exceeded. Please try again in a minute.');
    throw new Error(`Failed to fetch price data for ${symbol}`);
  }

  const priceData = normalizeAlphaVantageBars(timeSeries, isIntraday);

  // Cache validated data on the coherent adjustment basis
  await setCached(ck, priceData, isIntraday ? TTL.avIntraday : TTL.avDaily);

  const final = applyResample(priceData, parsedTimeframe);
  return { priceData: final, source: 'alpha_vantage', volumeUnavailable: false, closeType: 'adjusted' };
}

// ─── CoinGecko — Crypto ──────────────────────────────────────────────────

export async function fetchCryptoPriceData(
  symbol: string,
  timeframe: string = 'daily',
): Promise<PriceFetchResult> {
  const cleanSymbol = normalizeSymbol(symbol);
  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) throw new Error(`Unsupported timeframe: ${timeframe}`);

  const coinId = COINGECKO_ID_MAP[cleanSymbol] || (await resolveSymbolToId(cleanSymbol));
  if (!coinId) throw new Error(`No CoinGecko mapping found for ${cleanSymbol}`);

  const intraday = parsedTimeframe.kind === 'intraday';
  if (intraday && (parsedTimeframe.minutes < 60 || parsedTimeframe.minutes % 60 !== 0)) {
    throw new Error('CoinGecko backtests require genuine hourly or daily OHLC. Sub-hour timeframes are unavailable.');
  }
  const interval = intraday ? 'hourly' : 'daily';
  const intervalSeconds = intraday ? 3600 : 86400;
  const lookbackDays = intraday ? 90 : 1095;
  const ck = cacheKey('cg-ohlc', cleanSymbol, interval, String(lookbackDays));
  const cached = await getCached<PriceData>(ck);
  const resample = (data: PriceData) => parsedTimeframe.minutes > (intraday ? 60 : 1440)
    ? resampleCompleteCryptoBars(data, parsedTimeframe.minutes, intraday ? 60 : 1440)
    : data;
  if (cached && Object.keys(cached).length > 0) {
    return { priceData: resample(cached), source: 'coingecko', volumeUnavailable: true, closeType: 'n/a' };
  }
  const to = Math.floor(Date.now() / (intervalSeconds * 1000)) * intervalSeconds;
  const from = to - lookbackDays * 86400;
  const windowSeconds = (intraday ? 31 : 180) * 86400;
  const candles: number[][] = [];
  // At most 7 daily requests or 3 hourly requests, each within the provider cap.
  for (let start = from; start < to; start += windowSeconds) {
    const chunk = await getOHLCRange(coinId, start, Math.min(start + windowSeconds, to), { retries: 0, timeoutMs: 6000 }, interval);
    if (!chunk) throw new Error(`Genuine CoinGecko ${interval} OHLC is unavailable for ${cleanSymbol}. Backtest stopped.`);
    candles.push(...chunk);
  }
  const priceData = normalizeCoinGeckoBacktestCandles(candles, interval, to * 1000);
  if (!Object.keys(priceData).length) throw new Error(`No completed ${interval} OHLC candles for ${cleanSymbol}`);
  await setCached(ck, priceData, TTL.coingecko);
  return { priceData: resample(priceData), source: 'coingecko', volumeUnavailable: true, closeType: 'n/a' };
}

/** Apply the provider's close adjustment to every daily OHLC field. Volume
 * remains provider-reported shares; it is not a reconstructed traded notional. */
export function normalizeAlphaVantageBars(series: Record<string, Record<string, string>>, intraday: boolean): PriceData {
  const result: PriceData = {};
  for (const [date, row] of Object.entries(series)) {
    const raw = ['1. open', '2. high', '3. low', '4. close'].map(key => Number.parseFloat(row[key]));
    const adjustedClose = intraday ? raw[3] : Number.parseFloat(row['5. adjusted close']);
    const volume = Number.parseFloat(row[intraday ? '5. volume' : '6. volume']);
    if (!raw.every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(adjustedClose) || adjustedClose <= 0 || !Number.isFinite(volume) || volume < 0 || raw[1] < Math.max(raw[0], raw[3]) || raw[2] > Math.min(raw[0], raw[3])) {
      throw new Error(`Invalid Alpha Vantage OHLCV at ${date}`);
    }
    const adjustment = adjustedClose / raw[3];
    result[date] = { open: raw[0] * adjustment, high: raw[1] * adjustment, low: raw[2] * adjustment, close: adjustedClose, volume };
  }
  return result;
}

/** CoinGecko timestamps are candle CLOSE times; internal keys are opens. */
export function normalizeCoinGeckoBacktestCandles(candles: number[][], interval: 'hourly' | 'daily', nowMs: number): PriceData {
  const duration = interval === 'hourly' ? 3_600_000 : 86_400_000;
  const result: PriceData = {};
  for (const candle of [...candles].sort((a, b) => a[0] - b[0])) {
    const [closeTime, open, high, low, close] = candle;
    if (![closeTime, open, high, low, close].every(value => Number.isFinite(value) && value > 0) || closeTime % duration !== 0 || high < Math.max(open, close) || low > Math.min(open, close)) {
      throw new Error('Invalid CoinGecko OHLC candle or interval');
    }
    if (closeTime > nowMs) continue;
    const iso = new Date(closeTime - duration).toISOString();
    const key = interval === 'hourly' ? iso.replace('T', ' ').slice(0, 19) : iso.slice(0, 10);
    const bar = { open, high, low, close, volume: 0 };
    if (result[key] && JSON.stringify(result[key]) !== JSON.stringify(bar)) throw new Error('Conflicting CoinGecko candles at a chunk boundary');
    result[key] = bar;
  }
  return result;
}

export function resampleCompleteCryptoBars(data: PriceData, targetMinutes: number, sourceMinutes: number): PriceData {
  if (targetMinutes % sourceMinutes !== 0) throw new Error('Timeframe is not a multiple of the source OHLC interval');
  const resampled = resamplePriceData(data, targetMinutes, sourceMinutes);
  const sourceTimes = new Set(Object.keys(data).map(key => Date.parse(key.includes(' ') ? `${key.replace(' ', 'T')}Z` : `${key}T00:00:00Z`)));
  for (const key of Object.keys(resampled)) {
    const start = Date.parse(key.includes(' ') ? `${key.replace(' ', 'T')}Z` : `${key}T00:00:00Z`);
    for (let offset = 0; offset < targetMinutes; offset += sourceMinutes) {
      if (!sourceTimes.has(start + offset * 60_000)) {
        delete resampled[key]; // Do not label partial or gapped buckets as complete candles.
        break;
      }
    }
  }
  return resampled;
}

// ─── Smart fetch ──────────────────────────────────────────────────────────

export async function fetchPriceData(
  symbol: string,
  timeframe: string = 'daily',
  _startDate: string = '',
  _endDate: string = '',
  assetType?: 'stock' | 'crypto',
): Promise<PriceFetchResult> {
  if (assetType === 'crypto' || (!assetType && isCryptoSymbol(symbol))) {
    return fetchCryptoPriceData(symbol, timeframe);
  }
  return fetchStockPriceData(symbol, timeframe);
}

// ─── helpers ──────────────────────────────────────────────────────────────

function applyResample(
  priceData: PriceData,
  parsedTimeframe: ReturnType<typeof parseBacktestTimeframe>,
): PriceData {
  if (
    parsedTimeframe &&
    parsedTimeframe.needsResample &&
    parsedTimeframe.minutes > parsedTimeframe.sourceMinutes
  ) {
    return resamplePriceData(
      priceData,
      parsedTimeframe.minutes,
      parsedTimeframe.sourceMinutes,
    );
  }
  return priceData;
}
