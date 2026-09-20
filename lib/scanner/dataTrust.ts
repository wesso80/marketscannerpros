/**
 * ONE data-trust evaluator for Ranked rows, Scanner Analysis and Pro rows.
 * Verdicts: GOOD · DEGRADED · STALE · INSUFFICIENT_DATA. Pure — safe for server and client.
 *
 * Freshness is judged against the last bar the market could have COMPLETED, not against wall-clock age, so a Saturday
 * view of Friday's equity close is GOOD, while a daily bar two sessions behind is STALE.
 */
import { isNonTradingDay } from '@/lib/time/marketHolidays';

export type DataTrustLevel = 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT_DATA';
export type TrustAssetClass = 'equity' | 'crypto' | 'forex';
export type TrustTimeframe = '15m' | '30m' | '1h' | 'daily' | '1d' | 'weekly';

export interface DataTrustInput {
  assetClass: TrustAssetClass;
  timeframe: TrustTimeframe | string;
  /** ISO time of the last COMPLETED bar (open time is fine — tolerance covers one interval). */
  lastBarAt?: string | null;
  /** Actual interval the indicators were computed on, e.g. '4h' when a 'daily' request got 4h bars. */
  barInterval?: string | null;
  /** Number of completed bars used for indicators. */
  historyBars?: number | null;
  price?: number | null;
  /** Required indicators: name → present. Missing critical ones (price/ATR/RSI/ADX) drive INSUFFICIENT_DATA. */
  indicators?: Partial<Record<'atr' | 'rsi' | 'adx' | 'ema200' | 'macd', boolean>>;
  volumeAvailable?: boolean | null;
  /** Provider-level flags from the response envelope. */
  providerStale?: boolean;
  providerDegraded?: boolean;
  /** Set when the bar series contains a split-like close discontinuity (unadjusted corporate action). */
  priceDiscontinuity?: { date: string | null; ratio: number } | null;
  nowMs?: number;
}

export interface DataTrustResult {
  level: DataTrustLevel;
  /** Short, user-facing reasons in priority order. */
  reasons: string[];
  /** 0–1 multiplier a scorer may apply; never fabricates evidence, only discounts. */
  factor: number;
  freshness: 'fresh' | 'delayed' | 'stale' | 'unknown';
  /** True when `barInterval` does not match the requested timeframe. */
  intervalMismatch: boolean;
}

const INTERVAL_MINUTES: Record<string, number> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '60m': 60, '4h': 240, '1d': 1440, daily: 1440, '1w': 10_080, weekly: 10_080 };

export function normalizeTimeframeInterval(tf: string): string {
  const k = String(tf).toLowerCase().replace('min', 'm');
  if (k === 'daily' || k === '1d') return '1d';
  if (k === 'weekly' || k === '1w') return '1w';
  if (k === '60m') return '1h';
  return k;
}

/** Most recent US equity session date (YYYY-MM-DD) that has CLOSED as of `nowMs` (20:00 UTC close, weekends/holidays skipped). */
export function lastCompletedEquitySession(nowMs: number): string {
  const d = new Date(nowMs);
  // If today's session hasn't closed yet (before 20:00 UTC) start from yesterday.
  if (d.getUTCHours() < 20) d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 10; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !isNonTradingDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function judgeFreshness(input: DataTrustInput, nowMs: number): DataTrustResult['freshness'] {
  if (!input.lastBarAt) return 'unknown';
  const lastMs = Date.parse(input.lastBarAt);
  if (!Number.isFinite(lastMs)) return 'unknown';
  const interval = normalizeTimeframeInterval(input.barInterval || input.timeframe);
  const minutes = INTERVAL_MINUTES[interval] ?? 1440;

  if (input.assetClass === 'equity') {
    // Session-aware: a bar from the last CLOSED session is current whenever the market is shut (weekend, evening,
    // holiday). Only while a session is open do intraday bars age against the clock.
    const barDate = input.lastBarAt.slice(0, 10);
    const expected = lastCompletedEquitySession(nowMs);
    if (barDate > expected) return 'fresh';
    if (barDate === expected) {
      if (minutes >= 1440 || !isEquitySessionOpen(nowMs)) return 'fresh';
      const ageMin = (nowMs - lastMs) / 60_000;
      return ageMin <= minutes * 2 ? 'fresh' : ageMin <= minutes * 3 ? 'delayed' : 'stale';
    }
    const gapDays = Math.round((Date.parse(expected) - Date.parse(barDate)) / 86_400_000);
    if (minutes >= 10_080) return gapDays <= 7 ? 'fresh' : gapDays <= 14 ? 'delayed' : 'stale';
    return gapDays <= 1 ? 'delayed' : 'stale';
  }
  // 24/7 markets: allow one interval of lag (bar open time + interval = close), then one more as delayed.
  const ageMin = (nowMs - lastMs) / 60_000;
  if (ageMin <= minutes * 2) return 'fresh';
  if (ageMin <= minutes * 3) return 'delayed';
  return 'stale';
}

/** Regular US cash session 13:30–20:00 UTC on trading days (DST nuance ignored on purpose: ±1h only widens 'fresh'). */
export function isEquitySessionOpen(nowMs: number): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6 || isNonTradingDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins < 20 * 60;
}

export function evaluateDataTrust(input: DataTrustInput): DataTrustResult {
  const nowMs = input.nowMs ?? Date.now();
  const reasons: string[] = [];
  const requested = normalizeTimeframeInterval(input.timeframe);
  const actual = input.barInterval ? normalizeTimeframeInterval(input.barInterval) : requested;
  const intervalMismatch = actual !== requested;
  const freshness = judgeFreshness(input, nowMs);
  const ind = input.indicators ?? {};

  const missingCritical: string[] = [];
  if (!(typeof input.price === 'number' && Number.isFinite(input.price) && input.price > 0)) missingCritical.push('price');
  if (ind.atr === false) missingCritical.push('ATR');
  if (ind.rsi === false) missingCritical.push('RSI');
  if (ind.adx === false) missingCritical.push('ADX');

  let level: DataTrustLevel = 'GOOD';
  let factor = 1;

  if (missingCritical.includes('price') || missingCritical.length >= 2 || (input.historyBars != null && input.historyBars < 30)) {
    level = 'INSUFFICIENT_DATA';
    factor = 0.4;
    if (missingCritical.length) reasons.push(`missing ${missingCritical.join(', ')}`);
    if (input.historyBars != null && input.historyBars < 30) reasons.push(`only ${input.historyBars} bars of history`);
  } else if (input.priceDiscontinuity) {
    // Long-lookback indicators (EMA200, RS, ATR%) are contaminated by an unadjusted split; the row cannot be trusted
    // for structure claims even though the latest bars are fresh.
    level = 'INSUFFICIENT_DATA';
    factor = 0.4;
    const d = input.priceDiscontinuity;
    reasons.push(`price series has an unadjusted ${d.ratio < 1 ? 'split' : 'reverse split'}-like jump (×${d.ratio.toFixed(2)}${d.date ? ` on ${d.date.slice(0, 10)}` : ''}) — EMA200 / long-lookback indicators unreliable`);
  } else if (freshness === 'stale' || input.providerStale) {
    level = 'STALE';
    factor = 0.6;
    reasons.push(input.providerStale ? 'provider reports stale data' : 'last completed bar is behind the market');
  } else {
    if (intervalMismatch) { level = 'DEGRADED'; reasons.push(`indicators computed on ${actual} bars, not ${requested}`); }
    if (missingCritical.length) { level = 'DEGRADED'; reasons.push(`missing ${missingCritical.join(', ')}`); }
    if (ind.ema200 === false) { level = 'DEGRADED'; reasons.push('EMA200 unavailable (insufficient history)'); }
    if (input.volumeAvailable === false) { level = 'DEGRADED'; reasons.push('volume unavailable'); }
    if (freshness === 'delayed') { level = 'DEGRADED'; reasons.push('one bar behind the market'); }
    if (input.providerDegraded) { level = 'DEGRADED'; reasons.push('provider degraded'); }
    if (level === 'DEGRADED') factor = 0.85;
  }
  if (freshness === 'unknown' && level === 'GOOD') { level = 'DEGRADED'; factor = 0.85; reasons.push('bar time unknown'); }

  return { level, reasons, factor, freshness, intervalMismatch };
}

export const DATA_TRUST_LABEL: Record<DataTrustLevel, string> = {
  GOOD: 'GOOD',
  DEGRADED: 'DEGRADED',
  STALE: 'STALE',
  INSUFFICIENT_DATA: 'INSUFFICIENT DATA',
};
