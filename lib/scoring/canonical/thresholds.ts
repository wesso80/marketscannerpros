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
 * Minimum structural reward:risk (stop at the nearest confirmed swing, target at the nearest opposing swing ≥ 0.5 ATR
 * away). Below it the candidate is NOT a setup (ineligible, reason RR_BELOW_MIN) — a target 0.4 ATR away or a stop
 * 4 ATR away is not a trade. Projected targets (no opposing level) always qualify.
 * Decision 1.0, re-tested after the Sep 2026 levels fix: walk-forward OOS equity +0.18R [−0.15, +0.45] at ≥ 1.0 vs
 * +0.07R [−0.27, +0.60] at ≥ 1.5 (crypto −0.26 vs −0.30), and the 1.0–1.5 band on its own is no worse than ≥ 1.5
 * (equity −0.05R vs −0.08/−0.11R per trade) — raising it to 1.5 halves the setups without improving them.
 */
export const CANONICAL_MIN_RR = 1.0;
/** Minimum weighted factor coverage for PASS (below it: WATCH INSUFFICIENT_DATA). Same as the scanner contract. */
export const CANONICAL_COVERAGE_MIN = 0.6;
/** ATR% percentile at/above which volatility is extreme for the symbol (both directions → at most WATCH). */
export const CANONICAL_VOL_EXTREME_PCTL = 97;
/**
 * Highest grade a SNAPSHOT-mode verdict can get. An indicator snapshot scores only ~3 of the 6 factors (≈65% of the
 * weight, rescaled to 100), has no swing structure and volatility-only stops, so its factor score is mostly ADX and
 * nearly every trending row cleared the A cutoff. A needs bar data (swing structure, percentiles).
 */
export const SNAPSHOT_GRADE_MAX = 'B' as const;
