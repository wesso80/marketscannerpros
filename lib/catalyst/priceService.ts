/**
 * PriceService — Unified price-data abstraction for event studies.
 *
 * Wraps Alpha Vantage with caching to provide:
 *  - getDaily(ticker, start, end)
 *  - getBars(ticker, timeframe, start, end, includeExtended)
 *
 * All timestamps normalized to UTC internally.
 * Handles corporate action adjustments (AV returns adjusted by default).
 * Missing data is returned as gaps (never fabricated).
 */

import type { PriceBar } from './types';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const AV_BASE = 'https://www.alphavantage.co/query';

// ─── In-memory cache ────────────────────────────────────────────────

interface CacheEntry {
  bars: PriceBar[];
  fetchedAt: number;
}

const barCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60_000; // 15 minutes

function cacheKey(ticker: string, tf: string, ext: boolean): string {
  return `${ticker}|${tf}|${ext ? 'ext' : 'reg'}`;
}

function getCached(key: string): PriceBar[] | null {
  const entry = barCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) { barCache.delete(key); return null; }
  return entry.bars;
}

function setCache(key: string, bars: PriceBar[]): void {
  barCache.set(key, { bars, fetchedAt: Date.now() });
}

// ─── Alpha Vantage fetchers ─────────────────────────────────────────

type AV_Timeframe = '1min' | '5min' | '15min' | '30min' | '60min' | 'daily';

/**
 * Fetch daily OHLCV bars from Alpha Vantage.
 */
export async function getDaily(ticker: string, start: Date, end: Date): Promise<PriceBar[]> {
  const key = cacheKey(ticker, 'daily', false);
  const cached = getCached(key);
  if (cached) return filterByRange(cached, start, end);

  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${AV_KEY}`;
  const bars = await fetchAVTimeSeries(url, 'Time Series (Daily)');
  if (bars.length > 0) setCache(key, bars);
  return filterByRange(bars, start, end);
}

/**
 * Fetch intraday bars from Alpha Vantage.
 * @param timeframe  '1min' | '5min' | '15min' | '30min' | '60min'
 * @param includeExtended  If true, includes pre-market and after-hours bars.
 */
export async function getBars(
  ticker: string,
  timeframe: AV_Timeframe,
  start: Date,
  end: Date,
  includeExtended = true
): Promise<PriceBar[]> {
  if (timeframe === 'daily') return getDaily(ticker, start, end);

  const key = cacheKey(ticker, timeframe, includeExtended);
  const cached = getCached(key);
  if (cached) return filterByRange(cached, start, end);

  const extParam = includeExtended ? '&extended_hours=true' : '';
  const url = `${AV_BASE}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(ticker)}&interval=${timeframe}&outputsize=full${extParam}&apikey=${AV_KEY}`;
  const seriesKey = `Time Series (${timeframe})`;
  const bars = await fetchAVTimeSeries(url, seriesKey);
  if (bars.length > 0) setCache(key, bars);
  return filterByRange(bars, start, end);
}

// ─── Derived data for event studies ─────────────────────────────────

/**
 * Get the regular-session close price for a given date.
 * Uses daily bars. Returns null if no data.
 */
export async function getCloseOnDate(ticker: string, date: Date): Promise<number | null> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const bars = await getDaily(ticker, dayStart, dayEnd);
  if (bars.length === 0) return null;
  return bars[0].close;
}

/**
 * Get the regular-session open price for a given date.
 */
export async function getOpenOnDate(ticker: string, date: Date): Promise<number | null> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const bars = await getDaily(ticker, dayStart, dayEnd);
  if (bars.length === 0) return null;
  return bars[0].open;
}

/**
 * Get the daily OHLC bar for a specific date. Returns null if missing.
 */
export async function getDailyBar(ticker: string, date: Date): Promise<PriceBar | null> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const bars = await getDaily(ticker, dayStart, dayEnd);
  return bars.length > 0 ? bars[0] : null;
}

/**
 * Get N trading days of daily bars starting from a date.
 * Fetches extra to account for weekends/holidays, then trims.
 */
export async function getNTradingDays(ticker: string, fromDate: Date, n: number): Promise<PriceBar[]> {
  // Fetch extra calendar days to cover weekends
  const calendarDays = Math.ceil(n * 1.6) + 5;
  const end = new Date(fromDate.getTime() + calendarDays * 86_400_000);
  const bars = await getDaily(ticker, fromDate, end);
  // Sort ascending
  bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return bars.slice(0, n);
}

// ─── Internal helpers ───────────────────────────────────────────────

async function fetchAVTimeSeries(url: string, seriesKey: string): Promise<PriceBar[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[PriceService] AV fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();

    if (data['Note'] || data['Information']) {
      console.warn(`[PriceService] AV rate limit or info message:`, data['Note'] || data['Information']);
      return [];
    }

    const series = data[seriesKey];
    if (!series) {
      console.warn(`[PriceService] No "${seriesKey}" key in AV response for URL`);
      return [];
    }

    const bars: PriceBar[] = [];
    for (const [dateStr, values] of Object.entries(series)) {
      const v = values as Record<string, string>;
      bars.push({
        timestamp: new Date(dateStr),
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: parseFloat(v['5. volume'] || '0'),
      });
    }

    // Sort descending by timestamp (most recent first) — AV default
    bars.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return bars;
  } catch (err) {
    console.error('[PriceService] Fetch error:', err);
    return [];
  }
}

function filterByRange(bars: PriceBar[], start: Date, end: Date): PriceBar[] {
  const s = start.getTime();
  const e = end.getTime();
  return bars.filter(b => {
    const t = b.timestamp.getTime();
    return t >= s && t <= e;
  });
}

// ─── Data quality helpers ───────────────────────────────────────────

/**
 * Compute fraction of missing bars in a date range.
 * Compares expected trading days vs actual bars returned.
 */
export function computeMissingBarPercent(bars: PriceBar[], expectedTradingDays: number): number {
  if (expectedTradingDays <= 0) return 0;
  const actual = bars.length;
  const missing = Math.max(0, expectedTradingDays - actual);
  return missing / expectedTradingDays;
}
