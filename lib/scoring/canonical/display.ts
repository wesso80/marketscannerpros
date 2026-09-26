/**
 * Display helpers for canonical results (Phase 3). Pure, client-safe.
 *
 * Phase 3 validation found no setup × direction with a validated out-of-sample edge, so the product runs in
 * "factors only" mode: no PASS claims; calibrated context (daily equity/crypto) shows the calibrated probability of
 * the target printing before the invalidation and the expected R after costs, with horizon and sample size;
 * everything else is labelled uncalibrated. Results stored before Phase 3 (no scoreBasis) render as before.
 */
import { CANONICAL_MIN_RR } from './thresholds';
import type { CanonicalLevels, CanonicalResult } from './types';

type C = Pick<CanonicalResult, 'score' | 'permission'> & Partial<Pick<CanonicalResult, 'scoreBasis' | 'calibration' | 'factorScore'>>;

export const NO_EDGE_BANNER = 'Factors only — no validated edge. Research context, not a trade signal.';

export function isCalibrated(c: C | null | undefined): boolean {
  return !!c && c.scoreBasis === 'calibrated_expectancy_percentile' && !!c.calibration;
}

/** A canonical result as the display helpers see it, with the fields that tell a no-setup result apart. */
type CS = C & { setupType?: string; blockReasons?: Array<{ code: string; message: string }> | null };

/** Codes that only say "there is no setup" (not a hard block on an existing setup). */
const NO_SETUP_CODES = new Set(['NO_SETUP', 'INSUFFICIENT_HISTORY']);

export interface NoSetupDisplay {
  /** 'no_setup': nothing qualified; 'blocked': a hard block (stale data, earnings…) also applies. */
  kind: 'no_setup' | 'blocked';
  /** "No qualifying setup" or "Blocked: STALE_DATA". */
  headline: string;
  /** The engine's closest-candidate reason ("Closest: Trend continuation long — counter-trend: −DI ≥ +DI"),
   *  "Not enough bars for ATR / EMA50", or the hard-block messages; null when the engine gave none. */
  detail: string | null;
}

/**
 * How to show a canonical result with no setup (setupType NONE). The engine returns score 0 / grade F / BLOCK /
 * calibration null as placeholders there; showing them reads as "0/100, failed, uncalibrated" when it means "nothing
 * qualified on this bar". Null for any result that has a setup (real PASS / WATCH / BLOCK render as before).
 */
export function noSetupDisplay(c: CS | null | undefined): NoSetupDisplay | null {
  if (!c || c.setupType !== 'NONE') return null;
  const reasons = c.blockReasons ?? [];
  const hard = reasons.filter((r) => !NO_SETUP_CODES.has(r.code));
  const closestMsg = reasons.find((r) => r.code === 'NO_SETUP')?.message ?? '';
  const closest = /\(closest: (.+)\)\s*$/.exec(closestMsg)?.[1] ?? null;
  const history = reasons.find((r) => r.code === 'INSUFFICIENT_HISTORY')?.message ?? null;
  if (hard.length) {
    return { kind: 'blocked', headline: `Blocked: ${hard.map((r) => r.code).join(', ')}`, detail: hard.map((r) => r.message).join('; ') };
  }
  return { kind: 'no_setup', headline: 'No qualifying setup', detail: closest ? `Closest: ${closest}` : history };
}

/** "62nd pct" for calibrated results (percentile of expected R within its direction), "74/100 factors" otherwise;
 *  "No qualifying setup" when there is no setup (never "0/100"). */
export function scoreLabel(c: CS): string {
  const none = noSetupDisplay(c);
  if (none) return none.headline; // no setup: the engine's score 0 is a placeholder, not a score
  if (isCalibrated(c)) return `${ordinal(c.score)} pct`;
  if (c.scoreBasis === 'factor_alignment_uncalibrated') return `${c.score}/100 factors (uncalibrated)`;
  return `${c.score}/100`;
}

/** One-line calibration summary, or the uncalibrated label; null for pre-Phase-3 stored results. */
export function calibrationSummary(c: CS | null | undefined): string | null {
  if (!c || !c.scoreBasis) return null;
  if (c.setupType === 'NONE') return null; // no setup → nothing to calibrate (the context itself may be calibrated)
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

type GradeInput = Pick<CanonicalResult, 'grade' | 'score' | 'permission'>
  & Partial<Pick<CanonicalResult, 'scoreBasis' | 'calibration' | 'thresholds' | 'direction' | 'watchReasons' | 'flags'>>;

/**
 * Plain explanation of where a canonical grade comes from, for tooltips: the Setup score (canonical.score) sets the
 * grade, then caps apply. The MSP composite (compositeV2) never sets it. Same text for long and short.
 */
export function gradeBasis(c: GradeInput): string {
  if (c.grade === 'F' || c.permission === 'BLOCK') {
    return 'Grade F: no setup or a data / eligibility block, so the setup is not graded.';
  }
  const out: string[] = [];
  if (isCalibrated(c)) {
    out.push(`Grade ${c.grade} from the Setup score ${c.score} (${ordinal(c.score)} percentile of calibrated expected R): A ≥ 85, B ≥ 60, C below.`);
    out.push(GRADE_RELATIVE_SENTENCE);
  } else {
    const a = c.thresholds?.gradeA, b = c.thresholds?.gradeB;
    out.push(`Grade ${c.grade} from the Setup score ${c.score} (raw factor alignment, uncalibrated)${a != null && b != null ? `: A ≥ ${a}, B ≥ ${b}, C below` : ''}.`);
  }
  const cautions = cautionTags(c);
  if (cautions.length) out.push(`Capped at C: ${cautions.join(', ')}.`);
  const lowRR = (c.watchReasons ?? []).find((r) => r.code === 'RR_BELOW_MIN');
  if (lowRR) out.push(`Capped at C: reward:risk below ${CANONICAL_MIN_RR}.`);
  const snap = (c.flags ?? []).find((f) => f.code === 'SNAPSHOT_GRADE_CAP');
  if (snap) out.push(snap.message + '.');
  out.push('The MSP composite does not set the grade.');
  return out.join(' ');
}

/**
 * What a displayed % change is measured against (RS-19). Equities: the prior session close. Crypto trades 24/7, so
 * the basis is the provider's: CoinGecko's rolling 24h for live quotes, or the last completed bar's close for the
 * Golden Egg packet (a daily bar opens at 00:00 UTC, a weekly bar on Monday 00:00 UTC).
 */
export function priceChangeBasisLabel(assetType: string | null | undefined, basis: 'rolling_24h' | { barInterval: string | null | undefined }): string {
  if (assetType !== 'crypto') return 'vs prior close';
  if (basis === 'rolling_24h') return '24h';
  const bi = basis.barInterval;
  if (bi === '1d') return 'since 00:00 UTC';
  if (bi === '1w') return 'since Mon 00:00 UTC';
  return bi ? `since last ${bi} bar close` : 'since last bar close';
}

/** Direction-neutral form for the grade tooltip (gradeBasis reads the same for long and short). */
export const GRADE_RELATIVE_SENTENCE = 'Grade is relative within direction: expected R is ranked against other setups of the same direction, not against zero.';

/**
 * RS-17: a calibrated score/grade is a percentile of expected R among setups of the SAME direction, so a top-graded
 * short can still have negative expected R (it is the least-bad short). Says so; null when not calibrated/no setup.
 */
export function gradeRelativeNote(c: (C & { setupType?: string; direction?: string }) | null | undefined): string | null {
  if (!c || !isCalibrated(c) || c.setupType === 'NONE') return null;
  const dir = c.direction === 'short' ? 'short' : c.direction === 'long' ? 'long' : 'same-direction';
  const k = c.calibration!;
  const base = `Grade is relative within direction: it ranks this setup's expected R against other ${dir} setups, not against zero.`;
  if (!Number.isFinite(k.expectedR)) return base;
  if (!(k.expectedR > 0)) {
    const r = k.expectedR.toFixed(2);
    return `${base} Expected R is still ${r}R here, so a high grade means one of the better ${dir} setups, not a positive edge.`;
  }
  return base;
}
