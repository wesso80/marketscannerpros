/**
 * Backtest Price-Data Providers
 *
 * Handles fetching from Alpha Vantage (stocks) and CoinGecko (crypto).
 *
 * Audit fixes (2026-02-27):
 *   P0-3  – Intraday uses outputsize=compact by default (not full)
 *   P0-4  – Daily now reads "5. adjusted close" for split/dividend correctness
 *   Cache – Redis caching (daily 6h, intraday 120s, CoinGecko 300s)
 */

import { logger } from '@/lib/logger';
import { avTakeToken } from '@/lib/avRateGovernor';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
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
  return `bt:${provider}:${symbol}:${interval}:${outputsize}`;
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

  // P0-3: Use compact for intraday (full is huge + slow + wastes quota)
  const outputsize = isIntraday ? 'compact' : 'full';

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
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
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

  const priceData: PriceData = {};
  for (const [date, values] of Object.entries(timeSeries)) {
    const v = values as Record<string, string>;
    priceData[date] = {
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      // P0-4: Use adjusted close for daily, raw close for intraday
      close: !isIntraday && v['5. adjusted close']
        ? parseFloat(v['5. adjusted close'])
        : parseFloat(v['4. close']),
      volume: parseFloat(v[isIntraday ? '5. volume' : '6. volume'] || v['5. volume'] || '0'),
    };
  }

  // Cache the raw data
  await setCached(ck, priceData, isIntraday ? TTL.avIntraday : TTL.avDaily);

  const final = applyResample(priceData, parsedTimeframe);
  return { priceData: final, source: 'alpha_vantage', volumeUnavailable: false, closeType: isIntraday ? 'raw' : 'adjusted' };
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

  const days: 1 | 7 | 14 | 30 | 90 | 180 | 365 =
    parsedTimeframe.kind === 'daily' ? 365 : 7;

  const ck = cacheKey('cg', cleanSymbol, parsedTimeframe.normalized, String(days));

  const cached = await getCached<PriceData>(ck);
  if (cached && Object.keys(cached).length > 0) {
    logger.debug(`[backtest/providers] cache hit ${ck}`);
    const final = applyResample(cached, parsedTimeframe);
    return { priceData: final, source: 'coingecko', volumeUnavailable: true, closeType: 'n/a' };
  }

  const ohlc = await getOHLC(coinId, days);
  if (!ohlc || ohlc.length === 0) {
    throw new Error(`Failed to fetch CoinGecko OHLC data for ${cleanSymbol}`);
  }

  const priceData: PriceData = {};
  for (const candle of ohlc) {
    const date = new Date(candle[0]);
    const key =
      parsedTimeframe.kind === 'daily'
        ? date.toISOString().slice(0, 10)
        : date.toISOString().replace('T', ' ').slice(0, 19);

    priceData[key] = {
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: 0, // CoinGecko OHLC never returns volume
    };
  }

  await setCached(ck, priceData, TTL.coingecko);

  const final = applyResample(priceData, parsedTimeframe);
  logger.info(`Fetched ${Object.keys(final).length} ${timeframe} bars of crypto data for ${cleanSymbol} (CoinGecko)`);
  return { priceData: final, source: 'coingecko', volumeUnavailable: true, closeType: 'n/a' };
}

// ─── Smart fetch ──────────────────────────────────────────────────────────

export async function fetchPriceData(
  symbol: string,
  timeframe: string = 'daily',
  _startDate: string = '',
  _endDate: string = '',
): Promise<PriceFetchResult> {
  if (isCryptoSymbol(symbol)) {
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
