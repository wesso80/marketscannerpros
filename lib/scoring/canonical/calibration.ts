/**
 * Calibrated statistics for a canonical setup candidate (Phase 3). Pure.
 *
 * Only DAILY, bars-mode, equity/crypto candidates are calibrated (that is what was validated). Everything else —
 * intraday / weekly timeframes, forex, snapshot mode — returns null and the engine labels the result UNCALIBRATED.
 */
import { CALIBRATION, CALIBRATION_META, type CalibrationCell } from './calibrationData';
import type { CanonicalAssetClass, CanonicalCalibration, CanonicalDirection, SetupType } from './types';

const DAILY = new Set(['daily', '1d', 'd', '1day']);

export function isCalibratedContext(assetClass: CanonicalAssetClass, timeframe: string, mode: 'bars' | 'snapshot'): boolean {
  return mode === 'bars' && DAILY.has(String(timeframe).toLowerCase()) && (assetClass === 'equity' || assetClass === 'crypto');
}

/** Percentile (0–100) of `v` within 21 reference quantiles (0,5,…,100%), linear between quantiles, midpoint on ties. */
export function percentileIn(ref: readonly number[], v: number): number {
  if (!ref.length || !Number.isFinite(v)) return 0;
  const step = 100 / (ref.length - 1);
  if (v < ref[0]) return 0;
  if (v > ref[ref.length - 1]) return 100;
  let lo = -1, hi = -1;
  for (let i = 0; i < ref.length; i++) { if (ref[i] === v) { if (lo < 0) lo = i; hi = i; } }
  if (lo >= 0) return ((lo + hi) / 2) * step;
  for (let i = 1; i < ref.length; i++) {
    if (v < ref[i]) return (i - 1 + (v - ref[i - 1]) / (ref[i] - ref[i - 1])) * step;
  }
  return 100;
}

export function calibrationCell(cells: CalibrationCell[], riskReward: number): CalibrationCell {
  for (const c of cells) if (c.maxRR !== null && riskReward < c.maxRR) return c;
  return cells[cells.length - 1];
}

export function calibrateCandidate(
  assetClass: CanonicalAssetClass, timeframe: string, mode: 'bars' | 'snapshot',
  setupType: SetupType, direction: CanonicalDirection, riskReward: number,
): CanonicalCalibration | null {
  if (!isCalibratedContext(assetClass, timeframe, mode)) return null;
  const a = CALIBRATION[assetClass as 'equity' | 'crypto'];
  const bucket = a?.buckets[`${setupType}:${direction}`];
  if (!bucket) return null;
  const cell = calibrationCell(bucket.cells, Number.isFinite(riskReward) ? riskReward : 0);
  return {
    pTargetFirst: cell.pHit,
    expectedR: cell.expR,
    percentile: Number(percentileIn(a.reference[direction], cell.expR).toFixed(1)),
    horizonBars: CALIBRATION_META.horizonBars,
    sample: cell.n,
    bucketSample: bucket.n,
    bucketMeanR: bucket.meanR,
    bucketCi90: bucket.ci90,
    baselineR: bucket.baselineR,
    costsBps: CALIBRATION_META.costsBps[assetClass as 'equity' | 'crypto'],
    validatedEdge: bucket.passValidated,
    version: CALIBRATION_META.version,
  };
}

export { CALIBRATION_META };
