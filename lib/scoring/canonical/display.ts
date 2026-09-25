/**
 * Display helpers for canonical results (Phase 3). Pure, client-safe.
 *
 * Phase 3 validation found no setup × direction with a validated out-of-sample edge, so the product runs in
 * "factors only" mode: no PASS claims; calibrated context (daily equity/crypto) shows the calibrated probability of
 * the target printing before the invalidation and the expected R after costs, with horizon and sample size;
 * everything else is labelled uncalibrated. Results stored before Phase 3 (no scoreBasis) render as before.
 */
import type { CanonicalLevels, CanonicalResult } from './types';

type C = Pick<CanonicalResult, 'score' | 'permission'> & Partial<Pick<CanonicalResult, 'scoreBasis' | 'calibration' | 'factorScore'>>;

export const NO_EDGE_BANNER = 'Factors only — no validated edge. Research context, not a trade signal.';

export function isCalibrated(c: C | null | undefined): boolean {
  return !!c && c.scoreBasis === 'calibrated_expectancy_percentile' && !!c.calibration;
}

/** "62nd pct" for calibrated results (percentile of expected R within its direction), "74/100 factors" otherwise. */
export function scoreLabel(c: C): string {
  if (isCalibrated(c)) return `${ordinal(c.score)} pct`;
  if (c.scoreBasis === 'factor_alignment_uncalibrated') return `${c.score}/100 factors (uncalibrated)`;
  return `${c.score}/100`;
}

/** One-line calibration summary, or the uncalibrated label; null for pre-Phase-3 stored results. */
export function calibrationSummary(c: C | null | undefined): string | null {
  if (!c || !c.scoreBasis) return null;
  if (!isCalibrated(c)) return 'Uncalibrated timeframe/asset — factor alignment only; no outcome statistics.';
  const k = c.calibration!;
  const r = k.expectedR >= 0 ? `+${k.expectedR.toFixed(2)}` : k.expectedR.toFixed(2);
  return `P(target before invalidation) ${Math.round(k.pTargetFirst * 100)}% · expected ${r}R after ${k.costsBps} bps costs · `
    + `${k.horizonBars}-bar horizon · n=${k.sample.toLocaleString('en-US')} historical setups`
    + (k.validatedEdge ? '' : ' · no validated edge');
}

export function ordinal(n: number): string {
  const v = Math.round(n), m100 = v % 100, m10 = v % 10;
  const suf = m100 >= 11 && m100 <= 13 ? 'th' : m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th';
  return `${v}${suf}`;
}

/** Short tags for the cautions on a verdict (the AT_OPPOSING_LEVEL / MOMENTUM_DISAGREES watch reasons), e.g.
 *  ['at resistance', 'momentum disagrees']. Empty for results without them (including pre-v3 stored results). */
export function cautionTags(c: { direction?: string; watchReasons?: Array<{ code: string }> | null } | null | undefined): string[] {
  const codes = new Set((c?.watchReasons ?? []).map((r) => r.code));
  const out: string[] = [];
  if (codes.has('AT_OPPOSING_LEVEL')) out.push(c?.direction === 'short' ? 'at support' : 'at resistance');
  if (codes.has('MOMENTUM_DISAGREES')) out.push('momentum disagrees');
  return out;
}

/** How the target was set, for display: "swing level", "EMA20", or "projected 2R (no swing level)". */
export function targetBasisLabel(lv: Pick<CanonicalLevels, 'targetBasis' | 'riskReward'> | null | undefined): string {
  if (!lv) return '';
  if (lv.targetBasis === 'projected') return `projected ${Number(lv.riskReward.toFixed(2))}R (no swing level)`;
  return lv.targetBasis === 'ema20' ? 'EMA20' : 'swing level';
}
