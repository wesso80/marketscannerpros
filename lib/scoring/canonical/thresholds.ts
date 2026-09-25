/**
 * Per-setup permission and grade thresholds (0–100 canonical score).
 *
 * PROVISIONAL placeholders in P2-3; P2-5 replaces them with values calibrated from the replayed distribution.
 */
import type { CanonicalThreshold, SetupType } from './types';

export const CANONICAL_THRESHOLDS: Record<SetupType, CanonicalThreshold> = {
  TREND_CONTINUATION: { pass: 70, watch: 55, gradeA: 80, gradeB: 70 },
  PULLBACK: { pass: 70, watch: 55, gradeA: 80, gradeB: 70 },
  SQUEEZE: { pass: 70, watch: 55, gradeA: 80, gradeB: 70 },
  EXHAUSTION_FADE: { pass: 70, watch: 55, gradeA: 80, gradeB: 70 },
};

/**
 * Minimum structural reward:risk (to the nearest major opposing level) for PASS; below it the row is at most WATCH.
 * 1.0 = "reward at least equals risk". 1.5 capped ~57% of replay rows (continuation median R:R to the nearest major
 * level is ~0.5), so the stricter value is left as a product decision; structureRoom still grades R:R continuously.
 */
export const CANONICAL_MIN_RR = 1.0;
/** Minimum weighted factor coverage for PASS (below it: WATCH INSUFFICIENT_DATA). Same as the scanner contract. */
export const CANONICAL_COVERAGE_MIN = 0.6;
/** ATR% percentile at/above which volatility is extreme for the symbol (both directions → at most WATCH). */
export const CANONICAL_VOL_EXTREME_PCTL = 97;
