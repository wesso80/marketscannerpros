/**
 * marketData/freshness.ts — classify the age of a data point.
 *
 * Single rule book. If you add a new data type, give it expected refresh
 * intervals here so the rest of the system stays honest.
 */

import type { Freshness } from './types';

export interface FreshnessRule {
  /** Max age (s) for 'real-time' classification. */
  realTime: number;
  /** Max age (s) for 'delayed' classification. After this it is 'stale'. */
  delayed: number;
}

/** Per-data-type refresh policy. Used by the cache layer and consumers. */
export const FRESHNESS_RULES = {
  quote: { realTime: 120, delayed: 900 },
  intradayBars: { realTime: 300, delayed: 3_600 },
  dailyBars: { realTime: 3_600, delayed: 24 * 3_600 },
  indicators: { realTime: 300, delayed: 3_600 },
  overview: { realTime: 12 * 3_600, delayed: 7 * 24 * 3_600 },
  earnings: { realTime: 6 * 3_600, delayed: 48 * 3_600 },
  optionsChain: { realTime: 300, delayed: 2 * 3_600 },
  news: { realTime: 600, delayed: 6 * 3_600 },
  macroSeries: { realTime: 24 * 3_600, delayed: 7 * 24 * 3_600 },
} as const satisfies Record<string, FreshnessRule>;

export type DataType = keyof typeof FRESHNESS_RULES;

export function classifyFreshness(ageSeconds: number, type: DataType): Freshness {
  const rule = FRESHNESS_RULES[type];
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 'unknown';
  if (ageSeconds <= rule.realTime) return 'real-time';
  if (ageSeconds <= rule.delayed) return 'delayed';
  return 'stale';
}

export function computeStaleAfter(fetchedAt: string, type: DataType): string {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return new Date(0).toISOString();
  return new Date(t + FRESHNESS_RULES[type].delayed * 1_000).toISOString();
}

export function ageSecondsFrom(fetchedAt: string): number {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - t) / 1_000));
}
