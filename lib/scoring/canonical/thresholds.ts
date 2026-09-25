/**
 * Per-setup permission and grade thresholds (0–100 canonical score). PROVISIONAL — calibrated Sep 2026 from a
 * point-in-time daily replay (17 US equities/ETFs + BTC/ETH/SOL, ~Sep 2023–Sep 2026, 10,087 rows; the best eligible
 * setup's score on each bar, before caps):
 *
 *   setup               n      PASS ≥ p80   WATCH ≥ p50   A ≥ p85   B ≥ p60
 *   TREND_CONTINUATION  4452   77           69            79        72
 *   PULLBACK            2497   80           72            82        74
 *   SQUEEZE             1213   81           75            83        76
 *   EXHAUSTION_FADE      453   54           48            56        50
 *
 * i.e. PASS ≈ the top 20% of each setup type's own distribution, WATCH the next 30%, and the bottom half is BLOCK
 * (SCORE_BELOW_WATCH — a product decision; see the PR). Grades: A ≈ top 15%, B ≈ next 25%, C the rest (F = BLOCK).
 * Thresholds are per setup because the setups' factor sets differ (a fade never scores like a trend continuation).
 * Caps (coverage, VOL_EXTREME, RR_BELOW_MIN, REGIME_ADVERSE, DIRECTION_UNRESOLVED) apply after, so realised PASS
 * rates are lower. Distribution-based only — not fitted to forward returns (no edge has been demonstrated).
 * Recalibrate on a wider universe/out-of-sample window before treating these as final.
 */
import type { CanonicalThreshold, SetupType } from './types';

export const CANONICAL_THRESHOLDS: Record<SetupType, CanonicalThreshold> = {
  TREND_CONTINUATION: { pass: 77, watch: 69, gradeA: 79, gradeB: 72 },
  PULLBACK: { pass: 80, watch: 72, gradeA: 82, gradeB: 74 },
  SQUEEZE: { pass: 81, watch: 75, gradeA: 83, gradeB: 76 },
  EXHAUSTION_FADE: { pass: 54, watch: 48, gradeA: 56, gradeB: 50 },
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
