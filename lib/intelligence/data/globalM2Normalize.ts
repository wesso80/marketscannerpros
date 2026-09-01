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
