/**
 * Adapters between scanner rows and the canonical engine. Pure (client-safe).
 *
 * The canonical result is the PRIMARY verdict on scanner rows (row.canonical): permission, setup, direction, grade,
 * score and levels. The v2.4 composite (row.compositeV2) stays attached as a secondary "legacy composite" label.
 */
import { computeFeatures, featuresFromSnapshot } from './features';
import type { CanonicalBar, CanonicalFeatures, CanonicalReason, CanonicalResult } from './types';

/** Hard/data block codes produced by lib/scanner/hardBlocks + data trust (not score-derived). REGIME_GATE /
 *  REGIME_CHAOS are the legacy composite's own gates — the canonical engine handles volatility (VOL_EXTREME) and
 *  regime (overlay) itself, so they are not carried over. */
export const HARD_BLOCK_CODES = new Set(['DATA_ELIGIBILITY', 'STALE_DATA', 'PRICE_SANITY', 'EARNINGS_IN_WINDOW', 'LIQUIDITY_MIN', 'DATA_UNRELIABLE']);
/** Data-quality WATCH codes from the data-trust contract (carried into the canonical result). */
export const DATA_WATCH_CODES = new Set(['DATA_TIMESTAMP_UNKNOWN', 'DATA_TRUST_DEGRADED', 'DATA_DELAYED', 'DATA_TRUST_UNEVALUATED']);

/** Scanner candles (volume 0 = missing in several providers) → canonical bars (volume null when unavailable). */
export function canonicalFeaturesFromCandles(
  candles: Array<{ t: string | number; open: number; high: number; low: number; close: number; volume?: number | null }>,
  opts: { volumeAvailable?: boolean } = {},
): CanonicalFeatures | null {
  if (!Array.isArray(candles) || candles.length < 30) return null;
  const bars: CanonicalBar[] = candles
    .filter((c) => [c.open, c.high, c.low, c.close].every((v) => typeof v === 'number' && Number.isFinite(v)))
    .map((c) => ({
      t: typeof c.t === 'number' ? new Date(c.t).toISOString() : String(c.t),
      open: c.open, high: c.high, low: c.low, close: c.close,
      volume: opts.volumeAvailable !== false && typeof c.volume === 'number' && Number.isFinite(c.volume) && c.volume > 0 ? c.volume : null,
    }));
  if (bars.length < 30) return null;
  // Keep the most recent 500 bars: enough for EMA200 + a 252-bar percentile window, bounded cost per row.
  return computeFeatures(bars.slice(-500));
}

/** Snapshot features from a scanner row's indicator fields (bulk/light paths without bars). */
export function canonicalFeaturesFromRow(row: Record<string, any>): CanonicalFeatures | null {
  const ind = row.indicators ?? row;
  const price = Number(row.price ?? ind.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return featuresFromSnapshot({
    price, barDate: row.lastCandleTime ?? row.dataBasis?.lastCompletedBarAt ?? null,
    ema20: n(ind.ema20), ema50: n(ind.ema50), ema200: n(ind.ema200), adx: n(ind.adx), plusDI: n(ind.plusDI ?? ind.plus_di), minusDI: n(ind.minusDI ?? ind.minus_di),
    atr: n(ind.atr), rsi: n(ind.rsi), bbUpper: n(ind.bbUpper), bbLower: n(ind.bbLower), volumeRatio: n(row.liquidity?.volumeRatio ?? ind.volumeRatio) ?? null,
  });
}

/** Keep only hard/data blocks from a v2.4 contract's block list (score/gate blocks are the legacy composite's own). */
export function hardBlocksFrom(reasons: Array<{ code: string; message: string }> | undefined | null): CanonicalReason[] {
  return (reasons ?? []).filter((r) => HARD_BLOCK_CODES.has(r.code)).map((r) => ({ code: r.code, message: r.message }));
}

export function dataWatchFrom(reasons: Array<{ code: string; message: string }> | undefined | null): CanonicalReason[] {
  return (reasons ?? []).filter((r) => DATA_WATCH_CODES.has(r.code)).map((r) => ({ code: r.code, message: r.message }));
}

const PERM_ORDER: Record<string, number> = { PASS: 2, WATCH: 1, BLOCK: 0 };
const GRADE_ORDER: Record<string, number> = { A: 3, B: 2, C: 1, F: 0 };

/** Ranking: permission, then grade, then (calibrated) score, then raw factor score; rows without a canonical result sort last. */
export function compareCanonicalRows(a: { symbol: string; canonical?: (Pick<CanonicalResult, 'permission' | 'grade' | 'score'> & { factorScore?: number }) | null }, b: typeof a): number {
  const ca = a.canonical, cb = b.canonical;
  if (!ca || !cb) return (cb ? 1 : 0) - (ca ? 1 : 0); // both missing → 0 so callers can chain a fallback order
  return (PERM_ORDER[cb.permission] - PERM_ORDER[ca.permission]) || (GRADE_ORDER[cb.grade] - GRADE_ORDER[ca.grade]) || (cb.score - ca.score)
    || ((cb.factorScore ?? 0) - (ca.factorScore ?? 0)) || a.symbol.localeCompare(b.symbol);
}

export function scannerDirection(c: Pick<CanonicalResult, 'direction'>): 'bullish' | 'bearish' | 'neutral' {
  return c.direction === 'long' ? 'bullish' : c.direction === 'short' ? 'bearish' : 'neutral';
}

export const SETUP_LABEL: Record<string, string> = {
  TREND_CONTINUATION: 'Trend continuation', PULLBACK: 'Pullback', SQUEEZE: 'Squeeze', EXHAUSTION_FADE: 'Exhaustion fade', NONE: 'No setup',
};

/**
 * Project the canonical verdict onto the scanner row so every existing field agrees with it. The previous scenario
 * (direction/entry/stop/target/setup from the legacy composite) is kept under `legacyScenario`.
 */
export function applyCanonicalToScannerRow<T extends Record<string, any>>(row: T, c: CanonicalResult): T {
  const legacyScenario = { direction: row.direction, setup: row.setup, entry: row.entry, stop: row.stop, target: row.target, rMultiple: row.rMultiple, score: row.score, permission: row.permission };
  const out: Record<string, any> = { ...row, canonical: c, legacyScenario };
  out.permission = c.permission;
  out.blockReasons = c.blockReasons;
  out.watchReasons = c.watchReasons;
  out.coverage = c.coverage;
  out.score = c.score;
  out.grade = c.grade;
  out.setup = SETUP_LABEL[c.setupType] ?? c.setupType;
  out.direction = scannerDirection(c);
  if (c.levels && c.direction !== 'neutral') {
    out.entry = c.levels.entry;
    out.stop = c.levels.invalidation;
    out.target = c.levels.target;
    out.rMultiple = c.levels.riskReward;
    out.stopAnchor = c.levels.invalidationBasis;
  } else {
    out.entry = undefined; out.stop = undefined; out.target = undefined; out.rMultiple = undefined;
  }
  return out as T;
}
