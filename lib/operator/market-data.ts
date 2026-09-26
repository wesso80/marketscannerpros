/**
 * MSP Operator — Market Data Service
 * Fetches live OHLCV bars from Alpha Vantage and normalizes into operator schemas.
 * Computes key levels (PDH/PDL, weekly/monthly, VWAP, midpoint) from bar history.
 * @internal
 */

import type {
  Bar, KeyLevel, MarketDataSnapshot, MarketDataSnapshotRequest,
  CrossMarketState, EventWindow, Market,
} from '@/types/operator';
import type { MarketDataProvider } from './orchestrator';
import { avTryToken, avFetch } from '@/lib/avRateGovernor';
import { avCircuit } from '@/lib/circuitBreaker';
import { makeEnvelope } from './shared';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { nyWallTimeToUtcMs } from '@/lib/time/nyWallClock';
import { getBars as getCachedBars } from '@/lib/marketData';
import { vixWithAlphaVantagePrimary } from '@/lib/scoring/canonical/regimeOverlayData';

const AV_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';

function operatorOutputSize(): 'compact' | 'full' {
  return process.env.OPERATOR_AV_OUTPUTSIZE === 'full' ? 'full' : 'compact';
}

/* ── Equity entitlement (configurable, with graceful fallback) ─────────
 * OPERATOR_AV_ENTITLEMENT = realtime | delayed | none (default realtime: what the operator radar has
 * always requested). If Alpha Vantage answers that the key is not entitled to the requested feed, the
 * call is retried once without the parameter and the downgrade is remembered for 6 hours so the next
 * calls do not burn a request on the rejected feed first.
 */
export type AvEntitlement = 'realtime' | 'delayed' | 'none';
const ENTITLEMENT_DOWNGRADE_MS = 6 * 60 * 60 * 1000;
let entitlementDowngradedUntil = 0;

export function configuredEquityEntitlement(): AvEntitlement {
  const raw = (process.env.OPERATOR_AV_ENTITLEMENT || '').trim().toLowerCase();
  return raw === 'delayed' || raw === 'none' ? raw : 'realtime';
}

/** Entitlement to request right now (configured value, or 'none' while a rejection is remembered). */
export function effectiveEquityEntitlement(nowMs = Date.now()): AvEntitlement {
  const wanted = configuredEquityEntitlement();
  return wanted !== 'none' && nowMs < entitlementDowngradedUntil ? 'none' : wanted;
}

export function rememberEntitlementRejected(nowMs = Date.now()): void {
  entitlementDowngradedUntil = nowMs + ENTITLEMENT_DOWNGRADE_MS;
}

/** Test hook. */
export function resetEntitlementDowngrade(): void {
  entitlementDowngradedUntil = 0;
}

export function isEntitlementError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /entitle/i.test(msg);
}

export function entitlementParam(ent: AvEntitlement): string {
  return ent === 'none' ? '' : `&entitlement=${ent}`;
}

/* ── Timeframe → AV function mapping ───────────────────────── */

interface AVFunctionConfig {
  fn: string;
  tsKey: string;
  extraParams?: string;
}

export function isIntradayTimeframe(timeframe: string): boolean {
  return ['5m', '5min', '15m', '15min', '1h', '60min'].includes(timeframe.toLowerCase());
}

function resolveAVFunction(
  market: Market,
  timeframe: string,
  entitlement: AvEntitlement = 'realtime',
): AVFunctionConfig {
  const tf = timeframe.toLowerCase();

  if (market === 'CRYPTO') {
    if (['5m', '15m', '15min', '1h', '60min'].includes(tf)) {
      const interval = tf === '5m' ? '5min' : tf === '1h' ? '60min' : tf.replace('m', 'min');
      return {
        fn: 'CRYPTO_INTRADAY',
        tsKey: `Time Series Crypto (${interval})`,
        extraParams: `&market=USD&interval=${interval}&outputsize=${operatorOutputSize()}`,
      };
    }
    return {
      fn: 'DIGITAL_CURRENCY_DAILY',
      tsKey: 'Time Series (Digital Currency Daily)',
      extraParams: '&market=USD',
    };
  }

  // Equities / Futures / Forex / Options → standard endpoints. Regular-session bars only: Alpha Vantage includes
  // pre/post-market bars by default, so after the close the newest bar was a thin 19:45 ET bar (relative volume
  // near zero, compressed ranges) and averages mixed in extended-hours volume.
  const ent = entitlementParam(entitlement);
  if (['5m', '5min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (5min)', extraParams: `&interval=5min&outputsize=${operatorOutputSize()}&extended_hours=false${ent}` };
  }
  if (['15m', '15min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (15min)', extraParams: `&interval=15min&outputsize=${operatorOutputSize()}&extended_hours=false${ent}` };
  }
  if (['1h', '60min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (60min)', extraParams: `&interval=60min&outputsize=${operatorOutputSize()}&extended_hours=false${ent}` };
  }
  // Daily, 4H, 1W all use daily adjusted (4H/1W aggregated from daily)
  return { fn: 'TIME_SERIES_DAILY_ADJUSTED', tsKey: 'Time Series (Daily)', extraParams: `&outputsize=${operatorOutputSize()}${ent}` };
}

/* ── Core Bar Fetcher ───────────────────────────────────────── */

export interface AvCallOptions {
  /**
   * true  = wait for a rate-governor token (avFetch). Used by the shared saved scan job.
   * false = take a token only if one is free right now (avTryToken) and return [] otherwise, so an
   *         interactive admin request never queues behind the budget.
   */
  waitForToken?: boolean;
  /** Called once per Alpha Vantage request actually sent (for per-run call accounting). */
  onAvCall?: (label: string) => void;
}

const SKIPPED = Symbol('av-skipped');

async function avRequestJson(url: string, label: string, opts: AvCallOptions): Promise<any | null | typeof SKIPPED> {
  if (opts.waitForToken) {
    opts.onAvCall?.(label);
    return avFetch(url, label);
  }
  if (!(await avTryToken())) return SKIPPED;
  opts.onAvCall?.(label);
  const res = await avCircuit.call(() => fetch(url, { signal: AbortSignal.timeout(20_000) }));
  if (!res.ok) return null;
  const json = await res.json();
  if (json['Error Message'] || json['Note']) {
    console.warn(`[operator:market-data] AV error for ${label}:`, json['Error Message'] || json['Note']);
    return null;
  }
  if (json['Information']) throw new Error(`AV info error: ${json['Information']}`);
  return json;
}

async function fetchAVBars(
  symbol: string,
  market: Market,
  timeframe: string,
  opts: AvCallOptions = {},
): Promise<Bar[]> {
  if (!AV_KEY()) return [];

  const sym = market === 'CRYPTO'
    ? symbol.replace(/-?USD$/i, '').toUpperCase()
    : encodeURIComponent(symbol);
  const requested: AvEntitlement = market === 'CRYPTO' ? 'none' : effectiveEquityEntitlement();

  const request = async (ent: AvEntitlement) => {
    const cfg = resolveAVFunction(market, timeframe, ent);
    const url = `https://www.alphavantage.co/query?function=${cfg.fn}&symbol=${sym}${cfg.extraParams || ''}&apikey=${AV_KEY()}`;
    return { cfg, json: await avRequestJson(url, `OPERATOR ${cfg.fn} ${symbol}`, opts) };
  };

  try {
    let out: Awaited<ReturnType<typeof request>>;
    try {
      out = await request(requested);
    } catch (err) {
      if (requested === 'none' || !isEntitlementError(err)) throw err;
      rememberEntitlementRejected();
      console.warn(`[operator:market-data] AV key not entitled to entitlement=${requested}; retrying ${symbol} without it`);
      out = await request('none');
    }
    const { cfg, json } = out;
    if (!json || json === SKIPPED) return [];

    const timeSeries = json[cfg.tsKey];
    if (!timeSeries) {
      // Try dynamic key match
      const altKey = Object.keys(json).find(k => k.startsWith('Time Series'));
      if (!altKey || !json[altKey]) return [];
      return parseTimeSeries(json[altKey], symbol, market, timeframe);
    }

    return parseTimeSeries(timeSeries, symbol, market, timeframe);
  } catch (err) {
    console.error(`[operator:market-data] Fetch failed for ${symbol}:`, err instanceof Error ? err.message.replace(/apikey=[^&\s]+/gi, 'apikey=***') : err);
    return [];
  }
}

/**
 * Equity daily bars from the shared lib/marketData cache (Redis → Postgres → AV TIME_SERIES_DAILY_ADJUSTED,
 * 1h freshness). Every admin surface asking for the same symbol's daily bars within the hour shares one
 * Alpha Vantage call instead of each fetching its own.
 */
async function fetchCachedEquityDailyBars(symbol: string, market: Market, timeframe: string): Promise<Bar[]> {
  try {
    const env = await getCachedBars(symbol, 'daily');
    const rows = (env.data ?? []).filter(b => Number.isFinite(b.close) && b.close > 0);
    return rows
      .slice()
      .sort((a, b) => a.ts - b.ts)
      .map(b => ({
        symbol,
        market,
        timeframe,
        timestamp: String(b.date).slice(0, 10),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: Math.round(b.volume || 0),
      }));
  } catch (err) {
    console.warn(`[operator:market-data] cached daily bars failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/* ── Crypto key levels (CoinGecko daily OHLC, AV fallback) ────
 * Crypto price bars come straight from Alpha Vantage (CRYPTO_INTRADAY, DIGITAL_CURRENCY_DAILY for 1D).
 * CoinGecko OHLC has no candle volume, so it cannot feed the volume-based pipeline — but key levels only
 * need high/low/close. One CoinGecko daily-OHLC call per coin, cached 6 hours, gives PDH/PDL, midpoint and
 * weekly/monthly levels (no VWAP without volume).
 *
 * If CoinGecko is paused (OPERATOR_CG_FETCH_ENABLED), has no id for the symbol, or fails, levels fall back to
 * Alpha Vantage DIGITAL_CURRENCY_DAILY bars. A CoinGecko failure is only remembered briefly (the AV-derived
 * levels are held for CRYPTO_LEVELS_CG_RETRY_MS, then CoinGecko is tried again) and a total miss (both
 * providers empty) is cached for CRYPTO_LEVELS_MISS_TTL_MS — never for the full 6 hours.
 */
function envSecondsMs(name: string, fallbackSec: number): number {
  const raw = Number.parseInt(process.env[name] || '', 10);
  return (Number.isFinite(raw) && raw > 0 ? raw : fallbackSec) * 1000;
}
const CRYPTO_LEVELS_TTL_MS = envSecondsMs('OPERATOR_CG_LEVELS_TTL_SECONDS', 6 * 60 * 60);
/** How long AV-derived levels are held after a CoinGecko failure before CoinGecko is retried. */
const CRYPTO_LEVELS_CG_RETRY_MS = 15 * 60 * 1000;
/** How long AV-derived levels are held while CoinGecko is paused by the kill-switch. */
const CRYPTO_LEVELS_AV_ONLY_TTL_MS = 60 * 60 * 1000;
/** Negative cache when neither provider returned usable daily bars. */
const CRYPTO_LEVELS_MISS_TTL_MS = 5 * 60 * 1000;
const CRYPTO_LEVELS_CACHE_MAX = 500;

type CryptoLevelSource = 'coingecko' | 'alphavantage' | 'none';
const CRYPTO_LEVEL_BARS_CACHE = new Map<string, { bars: Bar[]; source: CryptoLevelSource; expiresAt: number }>();
const CRYPTO_LEVEL_BARS_INFLIGHT = new Map<string, Promise<{ bars: Bar[]; source: CryptoLevelSource }>>();

/** @internal test hook */
export function resetCryptoLevelCache(): void {
  CRYPTO_LEVEL_BARS_CACHE.clear();
  CRYPTO_LEVEL_BARS_INFLIGHT.clear();
}

/* ── Admin/operator CoinGecko kill-switch ─────────────────────
 * Pauses ALL CoinGecko fetches from the operator radar path
 * (admin-radar-crypto-* crons, /admin/live-scanner, etc.) to
 * stop quota burn. Paused by default; re-enable by setting the
 * env var OPERATOR_CG_FETCH_ENABLED=true on the web service.
 * When paused, the operator path makes zero CG calls: crypto bars
 * and key levels both come from Alpha Vantage.
 */
export function operatorCgFetchEnabled(): boolean {
  const raw = (process.env.OPERATOR_CG_FETCH_ENABLED || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

/**
 * CoinGecko OHLC rows ([ms, o, h, l, c]) → one bar per UTC day, oldest first. interval=daily already returns
 * daily candles; merging by date keeps the result correct if CoinGecko ever answers with finer candles.
 */
export function cgOhlcToDailyBars(rows: number[][] | null | undefined, symbol: string): Bar[] {
  const byDay = new Map<string, Bar>();
  const valid = (rows ?? [])
    .filter(r => Array.isArray(r) && r.length >= 5 && r.slice(0, 5).every(Number.isFinite) && r[4] > 0)
    .sort((a, b) => a[0] - b[0]);
  for (const [t, o, h, l, c] of valid) {
    const day = new Date(t).toISOString().slice(0, 10);
    const cur = byDay.get(day);
    if (!cur) {
      byDay.set(day, { symbol, market: 'CRYPTO', timeframe: '1D', timestamp: day, open: o, high: h, low: l, close: c, volume: 0 });
    } else {
      cur.high = Math.max(cur.high, h);
      cur.low = Math.min(cur.low, l);
      cur.close = c;
    }
  }
  return [...byDay.values()];
}

async function fetchCgDailyBars(symbol: string): Promise<Bar[]> {
  try {
    const clean = symbol.replace(/-?USD$/i, '').toUpperCase();
    const coinId = COINGECKO_ID_MAP[clean] || (await resolveSymbolToId(clean));
    if (!coinId) {
      console.warn(`[operator:market-data] CoinGecko id not found for ${symbol}`);
      return [];
    }
    return cgOhlcToDailyBars(await getOHLC(coinId, 30, { interval: 'daily' }), symbol);
  } catch (err) {
    console.error(`[operator:market-data] CoinGecko daily OHLC failed for ${symbol}:`, err);
    return [];
  }
}

/** Daily bars for crypto key levels: CoinGecko daily OHLC (6h cache) → AV daily fallback, briefly negative-cached. */
async function fetchCryptoLevelBars(symbol: string, opts: AvCallOptions): Promise<Bar[]> {
  const key = symbol.replace(/-?USD$/i, '').toUpperCase();
  const now = Date.now();
  const cached = CRYPTO_LEVEL_BARS_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.bars.map(b => ({ ...b, symbol }));

  let inflight = CRYPTO_LEVEL_BARS_INFLIGHT.get(key);
  if (!inflight) {
    inflight = (async () => {
      const cgEnabled = operatorCgFetchEnabled();
      const cg = cgEnabled ? await fetchCgDailyBars(symbol) : [];
      let result: { bars: Bar[]; source: CryptoLevelSource; ttl: number };
      if (cg.length >= 2) {
        result = { bars: cg, source: 'coingecko', ttl: CRYPTO_LEVELS_TTL_MS };
      } else {
        const av = await fetchAVBars(symbol, 'CRYPTO', '1D', opts);
        result = av.length >= 2
          ? { bars: av, source: 'alphavantage', ttl: cgEnabled ? CRYPTO_LEVELS_CG_RETRY_MS : CRYPTO_LEVELS_AV_ONLY_TTL_MS }
          : { bars: [], source: 'none', ttl: CRYPTO_LEVELS_MISS_TTL_MS };
      }
      if (CRYPTO_LEVEL_BARS_CACHE.size >= CRYPTO_LEVELS_CACHE_MAX) {
        const t = Date.now();
        for (const [k, v] of CRYPTO_LEVEL_BARS_CACHE) if (v.expiresAt <= t) CRYPTO_LEVEL_BARS_CACHE.delete(k);
        if (CRYPTO_LEVEL_BARS_CACHE.size >= CRYPTO_LEVELS_CACHE_MAX) CRYPTO_LEVEL_BARS_CACHE.clear();
      }
      CRYPTO_LEVEL_BARS_CACHE.set(key, { bars: result.bars, source: result.source, expiresAt: Date.now() + result.ttl });
      return result;
    })().finally(() => CRYPTO_LEVEL_BARS_INFLIGHT.delete(key));
    CRYPTO_LEVEL_BARS_INFLIGHT.set(key, inflight);
  }
  const { bars } = await inflight;
  return bars.map(b => ({ ...b, symbol }));
}

/**
 * Alpha Vantage stamps US equity intraday bars in New York local time and crypto intraday bars in UTC, both
 * without an offset. Store an ISO UTC instant so every consumer that does `new Date(bar.timestamp)` gets the
 * real time on a UTC server (it used to be read as UTC, 4–5 hours off). Daily bars stay "YYYY-MM-DD".
 */
export function normalizeAvBarTimestamp(raw: string, market: Market): string {
  const text = String(raw ?? '').trim();
  if (!/\d{2}:\d{2}/.test(text)) return text.slice(0, 10);
  const ms = market === 'CRYPTO'
    ? Date.parse(`${text.replace(' ', 'T')}Z`)
    : nyWallTimeToUtcMs(text);
  return ms != null && Number.isFinite(ms) ? new Date(ms).toISOString() : text;
}

export function parseTimeSeries(
  ts: Record<string, Record<string, string>>,
  symbol: string,
  market: Market,
  timeframe: string,
): Bar[] {
  const bars: Bar[] = [];

  for (const [timestamp, v] of Object.entries(ts)) {
    const close = parseFloat(v['4. close'] || v['4a. close (USD)'] || '0');
    if (!Number.isFinite(close) || close <= 0) continue;

    bars.push({
      symbol,
      market,
      timeframe,
      timestamp: normalizeAvBarTimestamp(timestamp, market),
      open: parseFloat(v['1. open'] || v['1a. open (USD)'] || '0'),
      high: parseFloat(v['2. high'] || v['2a. high (USD)'] || '0'),
      low: parseFloat(v['3. low'] || v['3a. low (USD)'] || '0'),
      close,
      volume: Math.round(parseFloat(v['5. volume'] || v['6. volume'] || '0')),
    });
  }

  bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return bars;
}

/* ── Key Level Computation ──────────────────────────────────── */

export function computeKeyLevels(bars: Bar[]): KeyLevel[] {
  if (bars.length < 2) return [];

  const levels: KeyLevel[] = [];
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // Previous Day High / Low
  levels.push({ name: 'PDH', price: prev.high, category: 'PDH', strength: 0.8 });
  levels.push({ name: 'PDL', price: prev.low, category: 'PDL', strength: 0.8 });

  // Midpoint of previous day range
  const mid = (prev.high + prev.low) / 2;
  levels.push({ name: 'Midpoint', price: mid, category: 'MIDPOINT', strength: 0.5 });

  // Weekly high/low (last 5 bars as proxy for daily data)
  if (bars.length >= 5) {
    const weekBars = bars.slice(-5);
    const weekHigh = Math.max(...weekBars.map(b => b.high));
    const weekLow = Math.min(...weekBars.map(b => b.low));
    levels.push({ name: 'Weekly High', price: weekHigh, category: 'WEEKLY_HIGH', strength: 0.7 });
    levels.push({ name: 'Weekly Low', price: weekLow, category: 'WEEKLY_LOW', strength: 0.7 });
  }

  // Monthly high/low (last 20 bars as proxy)
  if (bars.length >= 20) {
    const monthBars = bars.slice(-20);
    const monthHigh = Math.max(...monthBars.map(b => b.high));
    const monthLow = Math.min(...monthBars.map(b => b.low));
    levels.push({ name: 'Monthly High', price: monthHigh, category: 'MONTHLY_HIGH', strength: 0.6 });
    levels.push({ name: 'Monthly Low', price: monthLow, category: 'MONTHLY_LOW', strength: 0.6 });
  }

  // Simple VWAP approximation (cumulative price*volume / volume)
  let vwapNum = 0;
  let vwapDen = 0;
  for (const b of bars.slice(-20)) {
    const typical = (b.high + b.low + b.close) / 3;
    vwapNum += typical * b.volume;
    vwapDen += b.volume;
  }
  if (vwapDen > 0) {
    levels.push({ name: 'VWAP', price: vwapNum / vwapDen, category: 'VWAP', strength: 0.9 });
  }

  return levels;
}

/* ── Cross-Market State ─────────────────────────────────────── */

/** A VIX close older than this (calendar days) is treated as unknown rather than current. */
const VIX_MAX_AGE_DAYS = 5;

/** VIX level → state. Missing / invalid level → 'unknown' (adds no cross-market confidence). */
export function vixStateFromLevel(level: number | null | undefined): string {
  if (level == null || !Number.isFinite(level) || level <= 0) return 'unknown';
  return level > 30 ? 'elevated' : level > 20 ? 'cautious' : 'normal';
}

/**
 * VIX via the shared regime reader (Alpha Vantage INDEX_DATA through avRateGovernor, cached 15 min per
 * instance, FRED as fallback). When no recent VIX is available the state is 'unknown' — it used to default
 * to a made-up 20 ("normal"), which added +0.2 cross-market confidence to every symbol.
 */
async function fetchCrossMarketState(nowMs = Date.now()): Promise<CrossMarketState> {
  const state: CrossMarketState = {
    dxyState: 'neutral',
    vixState: 'unknown',
    breadthState: 'neutral',
  };

  try {
    const vix = await vixWithAlphaVantagePrimary(1, nowMs);
    const latest = vix?.rows?.[0];
    const onMs = latest ? Date.parse(`${latest.on}T00:00:00Z`) : NaN;
    if (latest && Number.isFinite(onMs) && nowMs - onMs <= VIX_MAX_AGE_DAYS * 86_400_000) {
      state.vixState = vixStateFromLevel(latest.value);
    }
  } catch {
    // Keep 'unknown'
  }

  return state;
}

/* ── Event Window ───────────────────────────────────────────── */

/**
 * Known high-impact economic events.
 * Dates are in YYYY-MM-DD format (UTC).
 * FOMC: 2-day meetings, we mark the announcement day (day 2).
 * CPI/PPI: release day. NFP (Jobs): first Friday of month.
 */
interface ScheduledEvent {
  date: string;
  name: string;
  severity: 'high' | 'medium';
  /** Hours before the event to start the caution window */
  leadHours: number;
  /** Hours after the event to keep the window active */
  trailHours: number;
}

const ECONOMIC_CALENDAR_2026: ScheduledEvent[] = [
  // FOMC announcements (2:00 PM ET on day 2)
  { date: '2026-01-28', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-03-18', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-04-29', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-06-17', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-07-29', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-09-16', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-10-28', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-12-16', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  // CPI releases (8:30 AM ET, typically mid-month)
  { date: '2026-01-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-02-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-03-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-04-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-05-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-06-10', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-07-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-08-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-09-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-10-13', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-11-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-12-10', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  // NFP / Jobs Report (8:30 AM ET, first Friday)
  { date: '2026-01-09', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-02-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-03-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-04-03', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-05-01', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-06-05', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-07-02', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-08-07', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-09-04', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-10-02', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-11-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-12-04', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  // PPI (day after CPI, medium impact)
  { date: '2026-01-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-02-12', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-03-12', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-04-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-05-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-06-11', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-07-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-08-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-09-14', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-10-14', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-11-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-12-11', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
];

/**
 * Evaluate whether the current moment falls within (or near) a known
 * high-impact economic event window.  Returns the nearest event that
 * the lead/trail window overlaps with "now".
 */
function getEventWindow(_symbol: string): EventWindow {
  const now = Date.now();

  let nearest: { event: ScheduledEvent; eventMs: number; distMs: number } | null = null;

  for (const ev of ECONOMIC_CALENDAR_2026) {
    // Parse date as 13:30 UTC for CPI/NFP/PPI, 18:00 UTC for FOMC
    const releaseHour = ev.name === 'FOMC' ? 18 : 13;
    const eventMs = new Date(`${ev.date}T${String(releaseHour).padStart(2, '0')}:30:00Z`).getTime();

    const leadStart = eventMs - ev.leadHours * 3600_000;
    const trailEnd = eventMs + ev.trailHours * 3600_000;

    // Is now inside the event window?
    if (now >= leadStart && now <= trailEnd) {
      return {
        isActive: true,
        severity: ev.severity,
        nextEventAt: new Date(eventMs).toISOString(),
      };
    }

    // Track nearest future event
    if (eventMs > now) {
      const dist = eventMs - now;
      if (!nearest || dist < nearest.distMs) {
        nearest = { event: ev, eventMs, distMs: dist };
      }
    }
  }

  return {
    isActive: false,
    severity: null,
    nextEventAt: nearest ? new Date(nearest.eventMs).toISOString() : null,
  };
}

/* ── Public Provider ────────────────────────────────────────── */

export type OperatorProviderOptions = AvCallOptions;

/**
 * Alpha Vantage market data provider for the Operator Engine. Every AV request goes through
 * avRateGovernor (avFetch when waitForToken, otherwise avTryToken) and the circuit breaker.
 * Equity daily bars / key levels come from the shared lib/marketData daily cache.
 */
export function createOperatorProvider(opts: OperatorProviderOptions = {}): MarketDataProvider {
  const bars = async (symbol: string, market: Market, timeframe: string): Promise<Bar[]> => {
    // Crypto: straight to AV CRYPTO_INTRADAY (DIGITAL_CURRENCY_DAILY for 1D). CoinGecko OHLC has no candle
    // volume, so asking it first only cost a wasted CoinGecko call per bar request.
    if (market === 'CRYPTO') return fetchAVBars(symbol, market, timeframe, opts);
    if (!isIntradayTimeframe(timeframe)) return fetchCachedEquityDailyBars(symbol, market, timeframe);
    return fetchAVBars(symbol, market, timeframe, opts);
  };
  return {
    getBars: bars,

    async getKeyLevels(symbol: string, market: Market): Promise<KeyLevel[]> {
      // Daily bars → levels
      const daily = market === 'CRYPTO'
        ? await fetchCryptoLevelBars(symbol, opts)
        : await fetchCachedEquityDailyBars(symbol, market, '1D');
      return computeKeyLevels(daily);
    },

    async getCrossMarketState(): Promise<CrossMarketState> {
      return fetchCrossMarketState();
    },

    async getEventWindow(symbol: string): Promise<EventWindow> {
      return getEventWindow(symbol);
    },
  };
}

export const alphaVantageProvider: MarketDataProvider = createOperatorProvider();

/**
 * Per-run memo around a provider: each (symbol, market, timeframe) bar series, each symbol's key levels and
 * the cross-market state are fetched at most once for the lifetime of the returned object. Use one per scan
 * run / request so the research packet can reuse the bars the pipeline already fetched and VIX is read once.
 */
export function memoizeProvider(base: MarketDataProvider): MarketDataProvider {
  const barCache = new Map<string, Promise<Bar[]>>();
  const levelCache = new Map<string, Promise<KeyLevel[]>>();
  let cross: Promise<CrossMarketState> | null = null;
  return {
    getBars(symbol, market, timeframe) {
      const key = `${symbol.toUpperCase()}|${market}|${timeframe.toLowerCase()}`;
      let hit = barCache.get(key);
      if (!hit) {
        hit = base.getBars(symbol, market, timeframe).catch(() => [] as Bar[]);
        barCache.set(key, hit);
      }
      return hit;
    },
    getKeyLevels(symbol, market) {
      const key = `${symbol.toUpperCase()}|${market}`;
      let hit = levelCache.get(key);
      if (!hit) {
        hit = base.getKeyLevels(symbol, market).catch(() => [] as KeyLevel[]);
        levelCache.set(key, hit);
      }
      return hit;
    },
    getCrossMarketState() {
      if (!cross) {
        cross = base.getCrossMarketState().catch(() => ({ dxyState: 'neutral', vixState: 'unknown', breadthState: 'neutral' }));
      }
      return cross;
    },
    getEventWindow(symbol) {
      return base.getEventWindow(symbol);
    },
  };
}

/* ── Snapshot helper ────────────────────────────────────────── */

export async function getMarketSnapshot(
  req: MarketDataSnapshotRequest,
): Promise<MarketDataSnapshot> {
  const bars = req.market === 'CRYPTO'
    ? await fetchAVBars(req.symbol, req.market, req.timeframe)
    : isIntradayTimeframe(req.timeframe)
      ? await fetchAVBars(req.symbol, req.market, req.timeframe)
      : await fetchCachedEquityDailyBars(req.symbol, req.market, req.timeframe);
  const keyLevels = computeKeyLevels(bars);
  const crossMarket = await fetchCrossMarketState();
  const eventWindow = getEventWindow(req.symbol);

  return {
    latestBar: bars.length > 0 ? bars[bars.length - 1] : null,
    keyLevels,
    eventWindow,
    crossMarket,
  };
}

/** Wrap result in standard API envelope */
export function createSnapshotResponse(snapshot: MarketDataSnapshot) {
  return makeEnvelope('market-data', snapshot);
}
