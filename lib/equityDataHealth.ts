/**
 * Equity options-data health helpers for the Capital Flow / Institutional Brain data-health gate.
 *
 * Two separate questions that used to be conflated:
 *  1. Is the options feed a genuine FALLBACK (no chain, fetch failed, undated/stale chain)?  → `isGenuineOptionsDataFallback`
 *     Informational notes in `dataConfidenceCaps` ("DTE excludes market holidays (approx.)", "EOD options data -
 *     confidence capped", Black-Scholes Greeks, sparse chain, grade caps…) are NOT fallbacks; they stay display-only.
 *  2. Is an EOD chain current?  → `isEodDataCurrent`
 *     Judged against the US equity trading calendar (weekends + NYSE holidays via lib/time/marketHolidays), not a
 *     60-second wall-clock check that an end-of-day date can never pass.
 */
import { isNonTradingDay } from '@/lib/time/marketHolidays';

export interface OptionsDataQualityLike {
  optionsChainSource?: string | null;
  freshness?: string | null;
}

/**
 * True only for a real data fallback: no options chain was obtained (provider returned nothing / fetch threw /
 * asset has no chain → source 'none'), or the chain carries no data date / was marked STALE.
 */
export function isGenuineOptionsDataFallback(dq: OptionsDataQualityLike | null | undefined): boolean {
  if (!dq) return true;
  return dq.optionsChainSource === 'none' || dq.freshness === 'STALE';
}

function nyDate(nowMs: number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(nowMs));
}

function previousTradingDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!isNonTradingDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * The oldest EOD data date that still counts as current at `nowMs`: the last US equity session that closed BEFORE
 * today's New York calendar date (T-1). Alpha Vantage's HISTORICAL_OPTIONS default is exactly "the previous trading
 * session", so during a session, after the close and over weekends/holidays the newest available EOD chain is T-1.
 * Examples (NY dates): Thu during/after hours → Wed; Sat/Sun/Mon → Fri; Tue after a Monday holiday → Fri.
 */
export function minimumCurrentEodDate(nowMs: number): string {
  return previousTradingDay(nyDate(nowMs));
}

/**
 * Is an EOD data date (YYYY-MM-DD…, e.g. the options chain's `date`) current? Unparseable/missing dates fail closed.
 * A date from before the previous trading session (e.g. Thursday's chain viewed on Saturday) is stale.
 */
export function isEodDataCurrent(dataDate: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!dataDate) return false;
  const ymd = String(dataDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !Number.isFinite(Date.parse(`${ymd}T00:00:00Z`))) return false;
  return ymd >= minimumCurrentEodDate(nowMs);
}
