/**
 * Per-setup FACTOR-SCORE thresholds — used only for UNCALIBRATED contexts (intraday / weekly timeframes, forex,
 * indicator snapshots), where they set the A/B/C grade of the raw factor alignment. They no longer decide
 * PASS/WATCH/BLOCK anywhere: Phase 3 validation (Sep 2026, 141 symbols, walk-forward) found the factor score has no
 * out-of-sample relationship with outcomes, so permission is driven by hard blocks, eligibility and the validated-edge
 * gate (./calibration). Original derivation (Phase 2, distribution percentiles of a 20-symbol replay):
 *
 *   setup               PASS ≥ p80   WATCH ≥ p50   A ≥ p85   B ≥ p60
 *   TREND_CONTINUATION  77           69            79        72
 *   PULLBACK            80           72            82        74
 *   SQUEEZE             81           75            83        76
 *   EXHAUSTION_FADE     54           48            56        50
 */
import type { CanonicalThreshold, SetupType } from './types';

export const CANONICAL_THRESHOLDS: Record<SetupType, CanonicalThreshold> = {
  TREND_CONTINUATION: { pass: 77, watch: 69, gradeA: 79, gradeB: 72 },
  PULLBACK: { pass: 80, watch: 72, gradeA: 82, gradeB: 74 },
  SQUEEZE: { pass: 81, watch: 75, gradeA: 83, gradeB: 76 },
  EXHAUSTION_FADE: { pass: 54, watch: 48, gradeA: 56, gradeB: 50 },
};

/**
 * Minimum structural reward:risk (to the nearest major opposing level); below it the row carries RR_BELOW_MIN
 * (WATCH). Phase 3 decision: 1.0. Walk-forward results with R:R ≥ 1.5 were not better than ≥ 1.0 out of sample
 * (equity +0.09R vs −0.00R, crypto −0.04R vs +0.07R per PASS-candidate trade, all CIs spanning zero) — a higher
 * minimum only lowers the target-first rate (P(target first) ≈ 1/(1+R:R), as a random walk would give).
 */
export const CANONICAL_MIN_RR = 1.0;
/** Minimum weighted factor coverage for PASS (below it: WATCH INSUFFICIENT_DATA). Same as the scanner contract. */
export const CANONICAL_COVERAGE_MIN = 0.6;
/** ATR% percentile at/above which volatility is extreme for the symbol (both directions → at most WATCH). */
export const CANONICAL_VOL_EXTREME_PCTL = 97;
