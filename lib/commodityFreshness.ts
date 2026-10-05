import { FRESHNESS_RULES } from '@/lib/marketData/freshness';

/**
 * Freshness for Alpha Vantage commodity series that are only published MONTHLY (ALUMINUM, COTTON, COFFEE, and COPPER /
 * WHEAT / CORN / SUGAR when their ETF proxy is unavailable — https://www.alphavantage.co/documentation/#commodities).
 *
 * A monthly observation is dated the first of its month and is published with a lag of a few weeks, so on 26 Sep the
 * newest value is typically July's or August's. Judging it by day age (it used to be "> 45 days → STALE") dropped
 * current monthly values and marked the whole lens degraded. Rule: current while it is at most 2 months behind the
 * current month (UTC); older than that is STALE.
 */
export const MONTHLY_MAX_MONTHS_BEHIND = 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function yearMonth(date: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

/** Whole months between the observation's month and the current month (UTC); null for an unreadable date. */
export function monthsBehind(date: string, nowMs: number = Date.now()): number | null {
  const obs = yearMonth(date);
  if (!obs) return null;
  const now = new Date(nowMs);
  return (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) - (obs.y * 12 + obs.m);
}

export function isMonthlyObservationCurrent(date: string, nowMs: number = Date.now()): boolean {
  const behind = monthsBehind(date, nowMs);
  return behind != null && behind >= 0 && behind <= MONTHLY_MAX_MONTHS_BEHIND;
}

/** "monthly, as of Aug 2026" — null for an unreadable date. */
export function monthlyAsOfLabel(date: string): string | null {
  const obs = yearMonth(date);
  return obs ? `monthly, as of ${MONTHS[obs.m - 1]} ${obs.y}` : null;
}

export type CommoditySourceKind = 'ETF_PROXY' | 'SPOT' | 'LEGACY_DAILY' | 'LEGACY_MONTHLY';
export type CommodityFreshnessStatus = 'LIVE' | 'DELAYED' | 'STALE';

/**
 * LIVE only when an observation instant is inside the shared quote real-time window.
 * A session date with no clock cannot prove that window, so it is not LIVE.
 */
export function quoteObservationIsLive(observedAtMs: number | null | undefined, nowMs: number = Date.now()): boolean {
  if (observedAtMs == null || !Number.isFinite(observedAtMs)) return false;
  const ageMs = nowMs - observedAtMs;
  return ageMs >= 0 && ageMs <= FRESHNESS_RULES.quote.realTime * 1000;
}

export function classifyCommodityFreshness(input: {
  source: CommoditySourceKind;
  date: string;
  maxAgeDays: number;
  observedAtMs?: number | null;
  nowMs?: number;
  ageDays?: number;
}): CommodityFreshnessStatus {
  const nowMs = input.nowMs ?? Date.now();
  const monthly = input.source === 'LEGACY_MONTHLY';
  const age = input.ageDays ?? Number.NaN;
  const stale = monthly ? !isMonthlyObservationCurrent(input.date, nowMs) : !Number.isFinite(age) || age > input.maxAgeDays;
  if (stale) return 'STALE';
  if (quoteObservationIsLive(input.observedAtMs, nowMs)) return 'LIVE';
  return 'DELAYED';
}

/** Card word. STALE and MONTHLY keep their existing meaning. Non-live session quotes say Last close, never LIVE. */
export function commodityCardStatusLabel(input: {
  freshnessStatus: CommodityFreshnessStatus;
  cadence?: 'live' | 'daily' | 'monthly' | null;
}): 'LIVE' | 'STALE' | 'MONTHLY' | 'Last close' {
  if (input.freshnessStatus === 'STALE') return 'STALE';
  if (input.cadence === 'monthly') return 'MONTHLY';
  if (input.freshnessStatus === 'LIVE') return 'LIVE';
  return 'Last close';
}
