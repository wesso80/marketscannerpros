/**
 * Server-side loader for the regime overlay inputs, from data the app already stores (no new paid dependencies):
 *   - macro_series (FRED ingest): VIX (VIXCLS), CREDIT_HY_OAS (BAMLH0A0HYM2), US_M2 (M2SL)
 *   - ohlcv_bars (worker bar store): SPY and QQQ daily closes → SMA50 / SMA200
 *   - optional macro risk state from the Golden Egg macro regime (caller passes it; it costs AV calls)
 * Every part fails soft: a missing input is just not counted by evaluateRegimeOverlay. Cached 15 minutes.
 *
 * Stale-input fallbacks (OV-1), used only when the stored rows are older than the regime's stale limit:
 *   - VIX / HY OAS: FRED's keyless CSV (lib/macro/fredCsv.ts), cached 6 hours per instance.
 *   - SPY / QQQ: one Alpha Vantage TIME_SERIES_DAILY_ADJUSTED (full) call per symbol through
 *     lib/marketData/client.ts, cached 6 hours per instance. Not written back to ohlcv_bars: that
 *     helper returns adjusted closes, while the worker stores raw closes in the same table.
 * A fallback is used only when it is newer than what is stored; otherwise the stored value stays.
 */
import { q } from '@/lib/db';
import type { IndexTrend, RegimeOverlayInputs } from './regimeOverlay';
import { MARKET_REGIME_POLICY } from '@/lib/marketRegime';
import { FRED_SERIES } from '@/lib/macro/fred';
import { getFredCsvCached } from '@/lib/macro/fredCsv';
import { avFetchDailyBars } from '@/lib/marketData/client';

const TTL_MS = 15 * 60 * 1000;
let cache: { at: number; data: RegimeOverlayInputs } | null = null;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const DAY_MS = 86_400_000;

type Obs = { on: string; value: number };
type Sourced<T> = T & { source: 'stored' | 'fred-csv' | 'alpha-vantage' };

/** True when a YYYY-MM-DD / ISO date is missing or older than the regime's stale limit. */
export function isOlderThanStaleLimit(dateLike: string | null | undefined, now = Date.now()): boolean {
  if (!dateLike) return true;
  const ms = Date.parse(dateLike.length === 10 ? `${dateLike}T00:00:00Z` : dateLike);
  if (!Number.isFinite(ms)) return true;
  return (now - ms) / DAY_MS > MARKET_REGIME_POLICY.staleAfterDays;
}

async function macroSeries(key: string, limit: number): Promise<Array<{ on: string; value: number }>> {
  const rows = await q<{ observed_on: Date | string; value: string | number | null }>(
    `SELECT observed_on, value FROM macro_series WHERE series_key = $1 AND value IS NOT NULL ORDER BY observed_on DESC LIMIT $2`, [key, limit]);
  return rows.map((r) => ({ on: String(r.observed_on instanceof Date ? r.observed_on.toISOString().slice(0, 10) : r.observed_on).slice(0, 10), value: num(r.value) }))
    .filter((r): r is { on: string; value: number } => r.value !== null);
}

/** Close vs SMA50/SMA200 from newest-first closes; null with fewer than 200. */
export function trendFromCloses(closesNewestFirst: number[], asOf: string | null): IndexTrend | null {
  if (closesNewestFirst.length < 200) return null;
  const avg = (k: number) => closesNewestFirst.slice(0, k).reduce((a, b) => a + b, 0) / k;
  return { close: closesNewestFirst[0], sma50: avg(50), sma200: avg(200), asOf };
}

async function storedIndexTrend(symbol: string): Promise<IndexTrend | null> {
  const rows = await q<{ ts: Date | string; close: string | number }>(`SELECT ts, close FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT 200`, [symbol]);
  const closes = rows.map((r) => num(r.close)).filter((v): v is number => v !== null);
  const latest = rows[0]?.ts ? new Date(rows[0].ts) : null;
  return trendFromCloses(closes, latest && !Number.isNaN(latest.getTime()) ? latest.toISOString() : null);
}

const FALLBACK_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_FAILURE_TTL_MS = 30 * 60 * 1000;
const avTrendCache = new Map<string, { at: number; trend: IndexTrend | null }>();

/** One full daily series per symbol per 6 hours (30 minutes after a failure). */
async function alphaVantageIndexTrend(symbol: string, now: number): Promise<IndexTrend | null> {
  const hit = avTrendCache.get(symbol);
  if (hit && now - hit.at < (hit.trend ? FALLBACK_TTL_MS : FALLBACK_FAILURE_TTL_MS)) return hit.trend;
  let trend: IndexTrend | null = null;
  try {
    const res = await avFetchDailyBars(symbol, true);
    const bars = res?.bars ?? [];
    const closes = bars.map((b) => b.close).filter((v) => Number.isFinite(v)).reverse();
    const last = bars[bars.length - 1];
    trend = trendFromCloses(closes, last ? new Date(last.ts).toISOString() : null);
  } catch (e) {
    console.warn(`[regimeOverlayData] ${symbol} daily fallback failed:`, e instanceof Error ? e.message : e);
  }
  avTrendCache.set(symbol, { at: now, trend });
  return trend;
}

/** Stored SPY/QQQ trend, or a fresher Alpha Vantage one when the stored bars are stale or under 200. */
async function indexTrend(symbol: string, now: number): Promise<Sourced<IndexTrend> | null> {
  const stored = await storedIndexTrend(symbol).catch(() => null);
  if (stored && !isOlderThanStaleLimit(stored.asOf, now)) return { ...stored, source: 'stored' };
  const fetched = await alphaVantageIndexTrend(symbol, now);
  if (fetched && (!stored || (Date.parse(fetched.asOf ?? '') || 0) > (Date.parse(stored.asOf ?? '') || 0))) {
    return { ...fetched, source: 'alpha-vantage' };
  }
  return stored ? { ...stored, source: 'stored' } : null;
}

/** Stored macro rows, or FRED's CSV when the stored latest is stale and the CSV is newer. Newest first. */
async function macroWithFallback(key: keyof typeof FRED_SERIES, limit: number, now: number): Promise<Sourced<{ rows: Obs[] }> | null> {
  const stored = await macroSeries(key, limit).catch(() => null);
  if (stored?.length && !isOlderThanStaleLimit(stored[0].on, now)) return { rows: stored, source: 'stored' };
  const csv = await getFredCsvCached(FRED_SERIES[key].fredId, { now });
  if (csv?.length) {
    const rows = csv.slice(-limit).reverse().map((o) => ({ on: o.date, value: Number(o.value) })).filter((o) => Number.isFinite(o.value));
    if (rows.length && (!stored?.length || rows[0].on > stored[0].on)) return { rows, source: 'fred-csv' };
  }
  return stored?.length ? { rows: stored, source: 'stored' } : null;
}

export async function loadRegimeOverlayInputs(opts: { macroRiskState?: RegimeOverlayInputs['macroRiskState'] } = {}): Promise<RegimeOverlayInputs> {
  if (cache && Date.now() - cache.at < TTL_MS) return { ...cache.data, macroRiskState: opts.macroRiskState ?? cache.data.macroRiskState ?? null };
  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };
  const now = Date.now();
  const [vixS, hyS, m2, spy, qqq] = await Promise.all([
    safe(() => macroWithFallback('VIX', 6, now)),
    safe(() => macroWithFallback('CREDIT_HY_OAS', 21, now)),
    safe(() => macroSeries('US_M2', 4)),
    safe(() => indexTrend('SPY', now)),
    safe(() => indexTrend('QQQ', now)),
  ]);
  const vix = vixS?.rows ?? null;
  const hy = hyS?.rows ?? null;
  const data: RegimeOverlayInputs = {
    asOf: vix?.[0]?.on ?? null,
    vix: vix && vix.length ? { level: vix[0].value, change5dPct: vix.length >= 6 ? (vix[0].value / vix[5].value - 1) * 100 : null, asOf: vix[0].on, source: vixS!.source } : null,
    hyOas: hy && hy.length ? { level: hy[0].value, change20dPp: hy.length >= 21 ? hy[0].value - hy[20].value : null, asOf: hy[0].on, source: hyS!.source } : null,
    m2: m2 && m2.length >= 4 ? { change3mPct: (m2[0].value / m2[3].value - 1) * 100 } : null,
    spy, qqq,
    macroRiskState: opts.macroRiskState ?? null,
    // Fragility stays unavailable (reported as such by the overlay). The only source is lib/intelligence/fragilityService,
    // which needs INTELLIGENCE_LIVE_DATA + provider keys, fetches ~20 Alpha Vantage / FRED / CoinGecko daily series
    // (competing with the scan crons' Alpha Vantage quota) and falls back to a MOCK fixture; there is also no
    // historical fragility series to validate a cap against (Phase 3). Wire it only after both are solved.
    fragility: null,
  };
  cache = { at: Date.now(), data };
  return data;
}
