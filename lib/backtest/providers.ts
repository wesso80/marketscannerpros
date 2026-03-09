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
import { getOHLC, getOHLCRange, getMarketChartFull, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
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

  // ──── Intraday: /market_chart gives hourly data for up to 90 days ────
  // CoinGecko /ohlc only returns 4H candles for 7-day windows (~42 bars),
  // which is far too few for EMA200 warmup.  /market_chart with days=90
  // yields ~2160 hourly data-points — plenty for indicator warm-up.
  if (parsedTimeframe.kind === 'intraday') {
    const ck = cacheKey('cg-mc', cleanSymbol, parsedTimeframe.normalized, '90');

    const cached = await getCached<PriceData>(ck);
    if (cached && Object.keys(cached).length > 0) {
      logger.debug(`[backtest/providers] cache hit ${ck}`);
      return { priceData: cached, source: 'coingecko', volumeUnavailable: false, closeType: 'n/a' };
    }

    const chart = await getMarketChartFull(coinId, 90);
    if (!chart || !chart.prices || chart.prices.length === 0) {
      throw new Error(`Failed to fetch CoinGecko market chart data for ${cleanSymbol}`);
    }

    // Build volume lookup from total_volumes (round to nearest hour)
    const HOUR_MS = 3_600_000;
    const volMap = new Map<number, number>();
    if (chart.total_volumes) {
      for (const [ts, vol] of chart.total_volumes) {
        if (Number.isFinite(vol) && vol >= 0) {
          const hourKey = Math.round(ts / HOUR_MS) * HOUR_MS;
          volMap.set(hourKey, vol);
        }
      }
    }

    // Group hourly price points into target-timeframe buckets
    const bucketMs = parsedTimeframe.minutes * 60_000;
    const buckets = new Map<number, { prices: number[]; vol: number }>();

    for (const [ts, price] of chart.prices) {
      if (!Number.isFinite(price)) continue;
      const bk = Math.floor(ts / bucketMs) * bucketMs;
      let bucket = buckets.get(bk);
      if (!bucket) { bucket = { prices: [], vol: 0 }; buckets.set(bk, bucket); }
      bucket.prices.push(price);
      const hourKey = Math.round(ts / HOUR_MS) * HOUR_MS;
      bucket.vol += volMap.get(hourKey) || 0;
    }

    const priceData: PriceData = {};
    for (const [bk, bucket] of buckets.entries()) {
      const date = new Date(bk);
      const key = date.toISOString().replace('T', ' ').slice(0, 19);
      priceData[key] = {
        open:   bucket.prices[0],
        high:   Math.max(...bucket.prices),
        low:    Math.min(...bucket.prices),
        close:  bucket.prices[bucket.prices.length - 1],
        volume: bucket.vol,
      };
    }

    await setCached(ck, priceData, TTL.coingecko);
    logger.info(
      `Fetched ${Object.keys(priceData).length} ${timeframe} bars of crypto data for ${cleanSymbol} (CoinGecko market_chart)`,
    );
    return { priceData, source: 'coingecko', volumeUnavailable: false, closeType: 'n/a' };
  }

  // ──── Daily: /ohlc/range with interval=daily — proper daily OHLC candles ────
  // CoinGecko /ohlc with days=365 auto-selects 4-day granularity (~92 bars),
  // far too few for EMA200 warmup.  /ohlc/range with interval=daily returns
  // true daily candles for the requested window (Analyst plan required).
  const now = Math.floor(Date.now() / 1000);
  const LOOKBACK_DAYS = 1095; // ~3 years of daily candles
  const from = now - LOOKBACK_DAYS * 86400;

  const ck = cacheKey('cg-range', cleanSymbol, 'daily', String(LOOKBACK_DAYS));

  const cached = await getCached<PriceData>(ck);
  if (cached && Object.keys(cached).length > 0) {
    logger.debug(`[backtest/providers] cache hit ${ck}`);
    const final = applyResample(cached, parsedTimeframe);
    return { priceData: final, source: 'coingecko', volumeUnavailable: true, closeType: 'n/a' };
  }

  const ohlc = await getOHLCRange(coinId, from, now);
  if (!ohlc || ohlc.length === 0) {
    // Fallback: /market_chart (available on all tiers) when /ohlc/range fails
    logger.warn(`[backtest/providers] /ohlc/range failed for ${cleanSymbol}, falling back to /market_chart`);
    const chart = await getMarketChartFull(coinId, LOOKBACK_DAYS);
    if (!chart || !chart.prices || chart.prices.length === 0) {
      throw new Error(`Failed to fetch CoinGecko price data for ${cleanSymbol}`);
    }

    // Build daily bars from hourly/daily price points
    const DAY_MS = 86_400_000;
    const volMap = new Map<string, number>();
    if (chart.total_volumes) {
      for (const [ts, vol] of chart.total_volumes) {
        if (Number.isFinite(vol) && vol >= 0) {
          const dayKey = new Date(Math.floor(ts / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
          volMap.set(dayKey, (volMap.get(dayKey) || 0) + vol);
        }
      }
    }

    const dailyBuckets = new Map<string, number[]>();
    for (const [ts, price] of chart.prices) {
      if (!Number.isFinite(price)) continue;
      const dayKey = new Date(Math.floor(ts / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
      let bucket = dailyBuckets.get(dayKey);
      if (!bucket) { bucket = []; dailyBuckets.set(dayKey, bucket); }
      bucket.push(price);
    }

    const fallbackData: PriceData = {};
    for (const [dayKey, prices] of dailyBuckets.entries()) {
      fallbackData[dayKey] = {
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: volMap.get(dayKey) || 0,
      };
    }

    await setCached(ck, fallbackData, TTL.coingecko);
    const final = applyResample(fallbackData, parsedTimeframe);
    logger.info(`Fetched ${Object.keys(final).length} daily bars for ${cleanSymbol} (CoinGecko market_chart fallback)`);
    return { priceData: final, source: 'coingecko', volumeUnavailable: false, closeType: 'n/a' };
  }

  const priceData: PriceData = {};
  for (const candle of ohlc) {
    const date = new Date(candle[0]);
    const key = date.toISOString().slice(0, 10);

    priceData[key] = {
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: 0, // CoinGecko OHLC range does not return volume
    };
  }

  await setCached(ck, priceData, TTL.coingecko);

  const final = applyResample(priceData, parsedTimeframe);
  logger.info(`Fetched ${Object.keys(final).length} daily bars of crypto data for ${cleanSymbol} (CoinGecko ohlc/range)`);
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
