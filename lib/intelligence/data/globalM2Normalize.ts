// Global M2 normalization contract (Phase 3B.1 design; fixtures only).
//
// Pure helpers for the future provider layer that will turn raw national M2 +
// FX into the USD-converted monthly series the engine consumes. NO live adapters
// (ECB/BOJ/BOE/…) are built here. FX-before-return: convert every month to USD
// FIRST, then the engine computes growth on USD levels.

import type { GlobalM2BlocInput, GlobalM2Observation, M2Classification } from '../engines/globalM2';

/** How a native→USD FX quote must be applied. */
export type FxDirection = 'multiply' | 'divide' | 'none';

export interface RawM2Point {
  month: string;    // YYYY-MM
  nativeM2: number; // as reported by the source (native units)
}

export interface RawFxPoint {
  month: string;    // YYYY-MM
  rate: number;     // month-aligned FX quote
}

/**
 * Convert one native-currency M2 value to USD.
 *  - 'multiply' for USD-per-unit quotes (EURUSD/GBPUSD/AUDUSD): usd = native × rate
 *  - 'divide'   for unit-per-USD quotes (USDJPY/USDCNY/…):      usd = native ÷ rate
 *  - 'none'     for USD blocs.
 * Returns NaN on a missing/zero rate so the caller can drop the month rather
 * than fabricate a value.
 */
export function convertM2ToUsd(nativeBaseUnits: number, fxRate: number | null, direction: FxDirection): number {
  if (direction === 'none') return nativeBaseUnits;
  if (fxRate == null || fxRate === 0 || !Number.isFinite(fxRate)) return NaN;
  return direction === 'multiply' ? nativeBaseUnits * fxRate : nativeBaseUnits / fxRate;
}

/** Build a month→rate lookup for the FX series. */
export function alignMonthlyFx(fx: RawFxPoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of fx) if (Number.isFinite(p.rate)) map.set(p.month, p.rate);
  return map;
}

export interface NormalizeM2Params {
  id: string;
  name: string;
  nativeCurrency: string;
  classification: M2Classification;
  provider: string;
  sourceSeries: string;
  sourceUrl?: string;
  definitionBreakpoints?: string[];
  stale?: boolean;
  fxDirection: FxDirection;
  /** Multiply reported nativeM2 by this to reach base-currency units (e.g. PBOC 亿元 → CNY = ×1e8). */
  nativeUnitScale?: number;
  m2: RawM2Point[];                 // ascending by month
  fxByMonth?: Map<string, number>;  // required unless fxDirection === 'none'
}

/**
 * Normalize a bloc into engine input: convert every month to USD using the
 * month-aligned FX, dropping months with no valid FX (never fabricated).
 */
export function normalizeM2Bloc(p: NormalizeM2Params): GlobalM2BlocInput {
  const scale = p.nativeUnitScale ?? 1;
  const observations: GlobalM2Observation[] = [];
  for (const point of p.m2) {
    if (!Number.isFinite(point.nativeM2)) continue;
    const rate = p.fxDirection === 'none' ? null : p.fxByMonth?.get(point.month) ?? null;
    const usd = convertM2ToUsd(point.nativeM2 * scale, rate, p.fxDirection);
    if (!Number.isFinite(usd)) continue; // no valid FX → drop, do not fake
    observations.push({ month: point.month, nativeM2: point.nativeM2, fxRate: rate, usdM2: usd });
  }
  return {
    id: p.id,
    name: p.name,
    nativeCurrency: p.nativeCurrency,
    classification: p.classification,
    observations,
    provider: p.provider,
    sourceSeries: p.sourceSeries,
    sourceUrl: p.sourceUrl,
    definitionBreakpoints: p.definitionBreakpoints,
    stale: p.stale,
  };
}

/* ── Wave-1 live-pipeline additions ────────────────────────────────────────── */

// Named unit transforms — no magic constants inside provider parsing.
export const UNIT_TRANSFORMS = {
  /** PBOC 货币供应量 is in 亿元 (100M CNY): ×1e8 → CNY. */
  pbocYiYuanToCny: (v: number) => v * 1e8,
  /** FRED M2SL is "Bil. of $": ×1e9 → USD. */
  fredBillionsUsdToUsd: (v: number) => v * 1e9,
  /** SNB snbmonagg is "In CHF millions": ×1e6 → CHF. */
  snbChfMillionsToChf: (v: number) => v * 1e6,
} as const;

/** FX alignment policy for mapping a monthly M2 observation to an FX close. */
export type FxAlignmentPolicy = 'MONTH_END_LAST_VALID';

export interface DailyFxPoint {
  date: string; // YYYY-MM-DD
  rate: number;
}

export interface AlignedFx {
  rate: number;
  fxObservationDate: string;
  policy: FxAlignmentPolicy;
}

/** Last calendar day of a YYYY-MM month (UTC), e.g. 2026-07 → 2026-07-31. */
export function lastCalendarDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * MONTH_END_LAST_VALID: the latest valid daily FX close on or before the final
 * calendar day of the M2 month. Walks backward over weekends/holidays; NEVER
 * walks forward into the next month. Returns null if no close on/before exists.
 */
export function alignMonthlyFxClose(
  month: string,
  daily: DailyFxPoint[],
  policy: FxAlignmentPolicy = 'MONTH_END_LAST_VALID',
): AlignedFx | null {
  const monthEnd = lastCalendarDay(month);
  let best: DailyFxPoint | null = null;
  for (const p of daily) {
    if (!Number.isFinite(p.rate) || p.rate <= 0) continue;
    if (p.date <= monthEnd && (!best || p.date > best.date)) best = p;
  }
  return best ? { rate: best.rate, fxObservationDate: best.date, policy } : null;
}

/** One fully-provenanced normalized observation. */
export interface NormalizedM2Observation extends GlobalM2Observation {
  nativeUnit: string;
  nativeValueRaw: number;
  fxPair: string | null;
  fxObservationDate: string | null;
  fxAlignmentPolicy: FxAlignmentPolicy | null;
}

export interface SourceFreshness {
  latestObservationMonth: string | null;
  retrievedAt: string;
  expectedCadence: 'monthly';
  stale: boolean;
  staleReason: string | null;
}

/** A normalized bloc with full provenance (extends the engine input). */
export interface NormalizedM2Bloc extends GlobalM2BlocInput {
  nativeUnit: string;
  retrievedAt: string;
  freshness: SourceFreshness;
  observations: NormalizedM2Observation[];
}

export interface NormalizeFullParams {
  id: string;
  name: string;
  nativeCurrency: string;
  nativeUnit: string;
  classification: M2Classification;
  provider: string;
  sourceSeries: string;
  sourceUrl?: string;
  definitionBreakpoints?: string[];
  retrievedAt: string;
  /** Multiply reported nativeM2 by this to reach base-currency units. */
  nativeUnitScale: number;
  fxDirection: FxDirection;
  fxPair: string | null;
  /** Daily FX series (unit-per-USD or USD-per-unit); required unless direction 'none'. */
  dailyFx?: DailyFxPoint[];
  fxAlignmentPolicy?: FxAlignmentPolicy;
  m2: RawM2Point[]; // ascending by month, valid months only
  /** Provider-supplied staleness (engine never decides this). */
  stale?: boolean;
  staleReason?: string | null;
}

/**
 * Full normalization with FX-before-return: for EACH month, resolve the aligned
 * FX close then convert to USD, preserving complete provenance. Months without a
 * valid aligned FX are dropped (never fabricated).
 */
export function normalizeM2BlocFull(p: NormalizeFullParams): NormalizedM2Bloc {
  const policy = p.fxAlignmentPolicy ?? 'MONTH_END_LAST_VALID';
  const observations: NormalizedM2Observation[] = [];
  for (const point of p.m2) {
    if (!Number.isFinite(point.nativeM2)) continue;
    let rate: number | null = null;
    let fxObservationDate: string | null = null;
    if (p.fxDirection !== 'none') {
      const aligned = p.dailyFx ? alignMonthlyFxClose(point.month, p.dailyFx, policy) : null;
      if (!aligned) continue; // no aligned FX → drop, do not fake
      rate = aligned.rate;
      fxObservationDate = aligned.fxObservationDate;
    }
    const usd = convertM2ToUsd(point.nativeM2 * p.nativeUnitScale, rate, p.fxDirection);
    if (!Number.isFinite(usd)) continue;
    observations.push({
      month: point.month,
      nativeM2: point.nativeM2,
      nativeUnit: p.nativeUnit,
      nativeValueRaw: point.nativeM2,
      fxRate: rate,
      fxPair: p.fxDirection === 'none' ? null : p.fxPair,
      fxObservationDate,
      fxAlignmentPolicy: p.fxDirection === 'none' ? null : policy,
      usdM2: usd,
    });
  }
  const latest = observations.length ? observations[observations.length - 1].month : null;
  return {
    id: p.id,
    name: p.name,
    nativeCurrency: p.nativeCurrency,
    nativeUnit: p.nativeUnit,
    classification: p.classification,
    observations,
    provider: p.provider,
    sourceSeries: p.sourceSeries,
    sourceUrl: p.sourceUrl,
    definitionBreakpoints: p.definitionBreakpoints,
    stale: p.stale,
    retrievedAt: p.retrievedAt,
    freshness: {
      latestObservationMonth: latest,
      retrievedAt: p.retrievedAt,
      expectedCadence: 'monthly',
      stale: p.stale ?? false,
      staleReason: p.staleReason ?? null,
    },
  };
}
