/**
 * Scalper bar freshness.
 *
 * A 5min/15min scalp read is only meaningful if the latest source bar is recent.
 * Rows whose latest bar is older than the cadence allows are "stale": they must not
 * carry a strength score, a direction, reference levels or a rank above fresh rows.
 *
 * Alpha Vantage intraday timestamps carry no zone: CRYPTO_INTRADAY is UTC,
 * TIME_SERIES_INTRADAY (equities) is US/Eastern.
 */

import { equityObservationUtc } from '@/lib/time/sessionCloseEngine';

export type ScalpTimeframe = '5min' | '15min';
export type ScalpAssetClass = 'crypto' | 'equity';

/** 3 bars of slack: 15 minutes on 5min, 45 minutes on 15min. */
export function scalpStaleThresholdMinutes(timeframe: ScalpTimeframe): number {
  return timeframe === '15min' ? 45 : 15;
}

export function scalpBarTimestampMs(lastBar: string | null | undefined, assetClass: ScalpAssetClass): number | null {
  if (!lastBar) return null;
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(lastBar);
  let ms: number;
  if (hasZone) ms = Date.parse(lastBar);
  else if (assetClass === 'equity') ms = equityObservationUtc(lastBar).getTime();
  else ms = Date.parse(lastBar.replace(' ', 'T') + 'Z');
  return Number.isFinite(ms) ? ms : null;
}

export function scalpBarAgeMinutes(
  lastBar: string | null | undefined,
  assetClass: ScalpAssetClass,
  nowMs: number = Date.now(),
): number | null {
  const ts = scalpBarTimestampMs(lastBar, assetClass);
  if (ts == null) return null;
  return Math.max(0, (nowMs - ts) / 60_000);
}

/** Unknown age counts as stale: freshness cannot be confirmed. */
export function isScalpBarStale(ageMinutes: number | null, timeframe: ScalpTimeframe): boolean {
  return ageMinutes == null || ageMinutes > scalpStaleThresholdMinutes(timeframe);
}

export function formatScalpBarAge(ageMinutes: number | null): string {
  if (ageMinutes == null) return 'age unknown';
  if (ageMinutes < 60) return `${Math.round(ageMinutes)}m old`;
  return `${(ageMinutes / 60).toFixed(1)}h old`;
}

/** Fresh rows ranked by strength (desc); stale rows always after them, in input order. */
export function rankScalpRows<T extends { stale: boolean; strength: number | null }>(rows: T[]): T[] {
  const fresh = rows.filter((r) => !r.stale).sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const stale = rows.filter((r) => r.stale);
  return [...fresh, ...stale];
}

export interface ScalpRowCore {
  assetClass: ScalpAssetClass;
  timeframe: ScalpTimeframe;
  lastBar: string;
  price: number;
  direction: 'long' | 'short' | 'neutral';
  strength: number | null;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
}

/**
 * Tag a row with its bar age. Stale rows lose their score, direction and levels
 * (the same way for long and short) so they cannot be read or ranked as a setup.
 */
export function withScalpFreshness<T extends ScalpRowCore>(
  row: T,
  nowMs: number = Date.now(),
): T & { stale: boolean; barAgeMinutes: number | null } {
  const age = scalpBarAgeMinutes(row.lastBar, row.assetClass, nowMs);
  const barAgeMinutes = age == null ? null : Math.round(age * 10) / 10;
  if (!isScalpBarStale(age, row.timeframe)) return { ...row, stale: false, barAgeMinutes };
  return {
    ...row,
    stale: true,
    barAgeMinutes,
    direction: 'neutral',
    strength: null,
    entry: row.price,
    stop: row.price,
    target1: row.price,
    target2: row.price,
    riskReward: 0,
  };
}
