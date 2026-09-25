/**
 * Canonical scoring engine (scoring-audit recommendation O2: one engine, one result, every surface).
 *
 *   features (bars → lib/ta/core, or an indicator snapshot)
 *     → every setup type × {long, short} scored on its own factor set   (./setups.ts)
 *     → each eligible candidate is calibrated (./calibration: P(target first), expected net R, from the Phase 3
 *       walk-forward validation; daily equity/crypto bars only)
 *     → best ELIGIBLE candidate wins: those meeting the minimum reward:risk first, then highest calibrated expected-R
 *       percentile (within its direction), then factor score, then coverage. Uncalibrated contexts rank by factor score.
 *     → permission: hard/data blocks, too little history or no eligible setup → BLOCK. Otherwise WATCH, with the
 *       reasons. PASS only when the setup × direction has a VALIDATED out-of-sample edge (none does as of Sep 2026:
 *       NO_VALIDATED_EDGE) and nothing else caps it (coverage < 0.6, extreme volatility, reward:risk < 1.0, adverse
 *       regime, unresolved direction). The factor score never BLOCKs (it was not predictive out of sample).
 *     → grade: calibrated → A ≥ 85th / B ≥ 60th percentile of calibrated expected R, else C; uncalibrated → per-setup
 *       factor-score thresholds (labelled uncalibrated); capped at C below the minimum reward:risk; F when BLOCK.
 *       The grade ranks a setup against same-direction setups — it is not an absolute quality or edge claim.
 *
 * Pure: no I/O. Callers supply hard blocks (lib/scanner/hardBlocks), flags, trust and optional regime overlay.
 */
import { computeFeatures, featuresFromSnapshot, type CanonicalSnapshot } from './features';
import { evaluateSetup } from './setups';
import { calibrateCandidate, isCalibratedContext } from './calibration';
import { CANONICAL_COVERAGE_MIN, CANONICAL_MIN_RR, CANONICAL_THRESHOLDS, CANONICAL_VOL_EXTREME_PCTL } from './thresholds';
import {
  CANONICAL_VERSION, SETUP_TYPES,
  type CanonicalAssetClass, type CanonicalBar, type CanonicalCalibration, type CanonicalFeatures, type CanonicalReason, type CanonicalResult,
  type CanonicalThreshold, type SetupCandidate, type SetupType,
} from './types';

export interface CanonicalRegimeOverlay {
  /** Position-size multiplier for the chosen direction (1 = full). */
  sizeMultiplier: number;
  /** WATCH reasons for the chosen direction (e.g. REGIME_ADVERSE). */
  watchReasons: CanonicalReason[];
  flags?: CanonicalReason[];
}

export interface CanonicalInput {
  symbol: string;
  assetClass: CanonicalAssetClass;
  timeframe: string;
  features: CanonicalFeatures;
  /** Hard blocks from lib/scanner/hardBlocks (stale data, price sanity, earnings in window, liquidity). */
  hardBlocks?: CanonicalReason[];
  flags?: CanonicalReason[];
  /** Data-quality WATCH reasons from the data-trust contract (delayed, timestamp unknown, degraded). */
  dataWatchReasons?: CanonicalReason[];
  /** Data-trust level label (GOOD / DEGRADED / STALE / INSUFFICIENT_DATA). */
  trust?: string | null;
  dataTimestamp?: string | null;
  catalystPending?: boolean;
  thresholds?: Partial<Record<SetupType, CanonicalThreshold>>;
  /** Direction-aware regime overlay, evaluated for the chosen direction (P2-4). */
  regimeOverlay?: (direction: 'long' | 'short') => CanonicalRegimeOverlay | null;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r2 = (v: number, dp = 2) => (fin(v) ? Number(v.toFixed(dp)) : null);

export function evaluateCanonical(input: CanonicalInput): CanonicalResult {
  const f = input.features;
  const blockReasons: CanonicalReason[] = [...(input.hardBlocks ?? [])];
  const watchReasons: CanonicalReason[] = [...(input.dataWatchReasons ?? [])];
  const flags: CanonicalReason[] = [...(input.flags ?? [])];
  if (f.mode === 'snapshot') flags.push({ code: 'SNAPSHOT_MODE', message: 'Indicator snapshot only — swing structure and percentiles unavailable' });

  const raw = {
    close: r2(f.close, 6), rsi: r2(f.rsi, 1), adx: r2(f.adx, 1), atrPct: r2(f.atrPct), atrPctPercentile: r2(f.atrPctPercentile, 0),
    distEma20Atr: r2(f.distEma20Atr), volumeRatio: f.volumeRatio === null ? null : r2(f.volumeRatio), structure: f.structure,
    bbwPercentile: r2(f.bbwPercentile, 0), squeezeRatio: r2(f.squeezeRatio), ema20: r2(f.ema20, 6), ema50: r2(f.ema50, 6), ema200: r2(f.ema200, 6),
  };
  const base = {
    version: CANONICAL_VERSION, symbol: input.symbol, assetClass: input.assetClass, timeframe: input.timeframe, mode: f.mode,
    barDate: f.barDate, dataTimestamp: input.dataTimestamp ?? f.barDate, trust: input.trust ?? null, raw,
  };

  if (!fin(f.close) || !fin(f.atr) || f.atr <= 0 || !fin(f.ema50)) {
    blockReasons.push({ code: 'INSUFFICIENT_HISTORY', message: 'Not enough bars for ATR / EMA50' });
    return { ...base, setupType: 'NONE', direction: 'neutral', score: 0, factorScore: 0, scoreBasis: 'factor_alignment_uncalibrated', calibration: null,
      grade: 'F', permission: 'BLOCK', blockReasons, watchReasons, flags, factors: [], coverage: 0, levels: null, sizeMultiplier: 0, thresholds: null, candidates: [] };
  }
  const calibrated = isCalibratedContext(input.assetClass, input.timeframe, f.mode);

  const all: SetupCandidate[] = [];
  for (const s of SETUP_TYPES) for (const d of ['long', 'short'] as const) all.push(evaluateSetup(f, s, d, { catalystPending: input.catalystPending }));
  const cal = new Map<SetupCandidate, CanonicalCalibration | null>(
    all.map((c) => [c, c.eligible && calibrated ? calibrateCandidate(input.assetClass, input.timeframe, f.mode, c.setupType, c.direction, c.levels.riskReward) : null]));
  const pct = (c: SetupCandidate) => cal.get(c)?.percentile ?? -1;
  // Among eligible candidates, those meeting the minimum reward:risk come first (a target 0.1R away has a high hit
  // rate but is an already-finished move), then calibrated percentile, factor score, coverage.
  const meetsRR = (c: SetupCandidate) => c.levels.targetBasis === 'projected' || c.levels.riskReward >= CANONICAL_MIN_RR;
  const ranked = [...all].sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(meetsRR(b)) - Number(meetsRR(a)) || pct(b) - pct(a) || b.score - a.score || b.coverage - a.coverage);
  const candidates = ranked.map((c) => ({ setupType: c.setupType, direction: c.direction, eligible: c.eligible, ...(c.ineligibleReason ? { ineligibleReason: c.ineligibleReason } : {}), score: c.score, coverage: c.coverage,
    ...(cal.get(c) ? { expectedR: cal.get(c)!.expectedR, pTargetFirst: cal.get(c)!.pTargetFirst } : {}) }));
  const best = ranked[0];

  if (!best?.eligible) {
    blockReasons.push({ code: 'NO_SETUP', message: 'No setup type is eligible on this bar' });
    return { ...base, setupType: 'NONE', direction: 'neutral', score: 0, factorScore: 0, scoreBasis: calibrated ? 'calibrated_expectancy_percentile' : 'factor_alignment_uncalibrated', calibration: null,
      grade: 'F', permission: 'BLOCK', blockReasons, watchReasons, flags, factors: [], coverage: 1, levels: null, sizeMultiplier: 0, thresholds: null, candidates };
  }

  const th = input.thresholds?.[best.setupType] ?? CANONICAL_THRESHOLDS[best.setupType];
  // Long and short of the same setup tie → no directional edge (e.g. a squeeze with a split bias). Report the setup
  // without a side and cap at WATCH; picking one side would make the result depend on evaluation order.
  const runnerUp = ranked[1];
  const unresolved = !!runnerUp?.eligible && runnerUp.setupType === best.setupType && runnerUp.score === best.score && runnerUp.direction !== best.direction && pct(runnerUp) === pct(best);
  const calibration = cal.get(best) ?? null;
  if (unresolved) watchReasons.push({ code: 'DIRECTION_UNRESOLVED', message: `${best.setupType} scores the same long and short — wait for the break` });
  if (best.coverage < CANONICAL_COVERAGE_MIN) {
    watchReasons.push({ code: 'INSUFFICIENT_DATA', message: `Factor coverage ${Math.round(best.coverage * 100)}% is below ${Math.round(CANONICAL_COVERAGE_MIN * 100)}%` });
  }
  if (fin(f.atrPctPercentile) && f.atrPctPercentile >= CANONICAL_VOL_EXTREME_PCTL) {
    watchReasons.push({ code: 'VOL_EXTREME', message: `ATR% at the ${Math.round(f.atrPctPercentile)}th percentile of its own history` });
  }
  if (best.levels.targetBasis !== 'projected' && best.levels.riskReward < CANONICAL_MIN_RR) {
    watchReasons.push({ code: 'RR_BELOW_MIN', message: `Structural reward:risk ${best.levels.riskReward} < ${CANONICAL_MIN_RR}` });
  }
  let sizeMultiplier = 1;
  const overlay = unresolved ? null : input.regimeOverlay?.(best.direction) ?? null;
  if (overlay) {
    sizeMultiplier = overlay.sizeMultiplier;
    watchReasons.push(...overlay.watchReasons);
    flags.push(...(overlay.flags ?? []));
  }

  // Edge gate (Phase 3): PASS needs a validated out-of-sample edge for this setup × direction. The factor score
  // alone never blocks — it did not predict outcomes — so a present, unblocked setup is at least WATCH (both sides).
  if (!calibration) {
    watchReasons.unshift({ code: 'UNCALIBRATED', message: `No validated calibration for ${input.assetClass} ${input.timeframe}${f.mode === 'snapshot' ? ' (snapshot)' : ''} — factors only, score is raw factor alignment` });
  } else if (!calibration.validatedEdge || calibration.expectedR <= 0) {
    watchReasons.unshift({ code: 'NO_VALIDATED_EDGE', message: `${best.setupType} ${best.direction}: no out-of-sample edge after costs (historical ${calibration.expectedR >= 0 ? '+' : ''}${calibration.expectedR}R per trade, target-first ${Math.round(calibration.pTargetFirst * 100)}%, n=${calibration.sample}) — factors only` });
  }

  let permission: CanonicalResult['permission'];
  if (blockReasons.length) permission = 'BLOCK';
  else permission = watchReasons.length ? 'WATCH' : 'PASS';

  const score = calibration ? Math.round(calibration.percentile) : best.score;
  const grade = permission === 'BLOCK' ? 'F'
    : !meetsRR(best) ? 'C' // below the minimum reward:risk → never graded A/B
    : calibration ? (calibration.percentile >= 85 ? 'A' : calibration.percentile >= 60 ? 'B' : 'C')
    : best.score >= th.gradeA ? 'A' : best.score >= th.gradeB ? 'B' : 'C';
  return {
    ...base, setupType: best.setupType, direction: unresolved ? 'neutral' : best.direction, score, factorScore: best.score,
    scoreBasis: calibration ? 'calibrated_expectancy_percentile' : 'factor_alignment_uncalibrated', calibration: unresolved ? null : calibration,
    grade, permission, blockReasons, watchReasons, flags, factors: best.factors, coverage: best.coverage, levels: unresolved ? null : best.levels,
    sizeMultiplier: permission === 'BLOCK' ? 0 : sizeMultiplier, thresholds: calibration ? null : th, candidates,
  };
}

/** Convenience: features from completed bars (oldest first) then evaluate. */
export function evaluateCanonicalFromBars(bars: CanonicalBar[], input: Omit<CanonicalInput, 'features'>): CanonicalResult {
  return evaluateCanonical({ ...input, features: computeFeatures(bars) });
}

/** Convenience: snapshot mode (indicator values only — lower coverage, ATR-fallback levels). */
export function evaluateCanonicalFromSnapshot(snapshot: CanonicalSnapshot, input: Omit<CanonicalInput, 'features'>): CanonicalResult {
  return evaluateCanonical({ ...input, features: featuresFromSnapshot(snapshot) });
}
