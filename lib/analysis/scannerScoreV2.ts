/* ---------------------------------------------------------------------------
   MSP COMPOSITE v2 — cross-sectional, regime-conditional, normalized scoring
   core (pure, dependency-light, fully unit-tested).

   This is the scoring METHODOLOGY upgrade. It does not compute indicators — it
   takes already-computed, normalized factor signals and produces:
     • a regime-weighted composite (0–100) with an explicit weight vector,
     • a direction with a neutral band,
     • hard evidence / freshness / liquidity multipliers (thin data cannot top
       the board),
     • a cross-sectional percentile rank so a score MEANS something relative to
       the universe scanned today.

   Design principles (why this beats the v1 additive model):
     1. Correlated indicators are collapsed to ONE signal per independent factor
        group BEFORE they reach this module, so trend is not quadruple-counted.
     2. Weights are regime-conditional (trend vs range vs compression differ).
     3. Everything is relative: signals are expected in [-1, 1] (produced by
        percentile / z-score normalization upstream), never raw indicator units.
     4. Evidence quality gates the headline as a multiplier, not a display cap.

   Educational framing: the composite is a NOTABILITY-FOR-RESEARCH score, not a
   probability and not a trade signal.
   --------------------------------------------------------------------------- */

import type { EvidenceQualityLevel } from './terminology';

/** Coarse regime buckets the weight table is keyed on. The wiring layer maps
 *  the app's richer regime classification onto one of these. */
export type ScoreRegime =
  | 'trending'
  | 'ranging'
  | 'compression'
  | 'expansion'
  | 'high_volatility'
  | 'neutral';

/** Independent scoring factors. Correlated indicators are collapsed into one of
 *  these upstream so each is (approximately) independent evidence. */
export type ScoreFactor =
  | 'TREND'
  | 'MOMENTUM'
  | 'VOLUME'
  | 'RELATIVE_STRENGTH'
  | 'VOLATILITY'
  | 'POSITIONING'
  | 'QUALITY'
  | 'CATALYST';

export const SCORE_FACTOR_LABEL: Record<ScoreFactor, string> = {
  TREND: 'Trend',
  MOMENTUM: 'Momentum',
  VOLUME: 'Volume / Participation',
  RELATIVE_STRENGTH: 'Relative Strength',
  VOLATILITY: 'Volatility State',
  POSITIONING: 'Positioning',
  QUALITY: 'Quality / Liquidity',
  CATALYST: 'Catalyst',
};

/** A single normalized factor signal. `signed` is direction+strength in [-1, 1]
 *  (bullish positive). `available:false` factors are excluded and their weight
 *  redistributed across the rest. */
export interface FactorInput {
  factor: ScoreFactor;
  /** Directional strength in [-1, 1]; produced by upstream normalization. */
  signed: number;
  available: boolean;
}

/** Regime-conditional weight vectors. Heuristic and principled to start; the
 *  intent is later empirical calibration via the backtest engine. Rows need not
 *  sum to 1 — weights are renormalized over the AVAILABLE factors at runtime. */
export const REGIME_WEIGHTS_V2: Record<ScoreRegime, Record<ScoreFactor, number>> = {
  // Trend: reward directional persistence, relative strength, participation.
  trending: { TREND: 0.28, MOMENTUM: 0.16, VOLUME: 0.12, RELATIVE_STRENGTH: 0.20, VOLATILITY: 0.06, POSITIONING: 0.06, QUALITY: 0.08, CATALYST: 0.04 },
  // Range: reward mean-reversion oscillators + volatility-state, discount trend.
  ranging: { TREND: 0.10, MOMENTUM: 0.24, VOLUME: 0.12, RELATIVE_STRENGTH: 0.12, VOLATILITY: 0.20, POSITIONING: 0.08, QUALITY: 0.10, CATALYST: 0.04 },
  // Compression: the pre-expansion setup — volatility state and participation lead.
  compression: { TREND: 0.12, MOMENTUM: 0.12, VOLUME: 0.18, RELATIVE_STRENGTH: 0.14, VOLATILITY: 0.26, POSITIONING: 0.06, QUALITY: 0.08, CATALYST: 0.04 },
  // Expansion: trend + momentum + participation confirm the move.
  expansion: { TREND: 0.24, MOMENTUM: 0.22, VOLUME: 0.16, RELATIVE_STRENGTH: 0.14, VOLATILITY: 0.08, POSITIONING: 0.06, QUALITY: 0.06, CATALYST: 0.04 },
  // High volatility / risk-off: prize quality, liquidity, positioning; damp momentum.
  high_volatility: { TREND: 0.14, MOMENTUM: 0.10, VOLUME: 0.12, RELATIVE_STRENGTH: 0.14, VOLATILITY: 0.12, POSITIONING: 0.16, QUALITY: 0.18, CATALYST: 0.04 },
  // Neutral / unknown: balanced.
  neutral: { TREND: 0.20, MOMENTUM: 0.18, VOLUME: 0.14, RELATIVE_STRENGTH: 0.16, VOLATILITY: 0.12, POSITIONING: 0.08, QUALITY: 0.08, CATALYST: 0.04 },
};

/** Evidence quality as a hard multiplier on the composite. */
export const EVIDENCE_MULTIPLIER: Record<EvidenceQualityLevel, number> = {
  HIGH: 1.0,
  MEDIUM: 0.85,
  LOW: 0.65,
  INSUFFICIENT: 0.45,
};

export type ScoreFreshness = 'live' | 'delayed' | 'stale' | 'missing';

export const FRESHNESS_MULTIPLIER: Record<ScoreFreshness, number> = {
  live: 1.0,
  delayed: 0.92,
  stale: 0.75,
  missing: 0.5,
};

export interface CompositeV2Input {
  factors: FactorInput[];
  regime: ScoreRegime;
  evidenceQuality: EvidenceQualityLevel;
  freshness?: ScoreFreshness;
  /** Liquidity multiplier in (0, 1]; 1 = ample, <1 = thin. Defaults to 1. */
  liquidityMultiplier?: number;
  /** Neutral band on the directional aggregate; |dir| below this = neutral. */
  neutralBand?: number;
}

export interface FactorContribution {
  factor: ScoreFactor;
  signed: number;
  /** Renormalized weight actually applied (0 if unavailable). */
  weight: number;
  /** Signed contribution to the directional aggregate (weight × signed). */
  contribution: number;
}

export interface CompositeV2Result {
  /** 0–100 notability-for-research score after all multipliers. */
  composite: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Directional aggregate in [-1, 1] before magnitude/scaling. */
  directional: number;
  /** Raw magnitude 0–100 before evidence/freshness/liquidity multipliers. */
  rawMagnitude: number;
  regime: ScoreRegime;
  appliedMultiplier: number;
  contributions: FactorContribution[];
  availableFactors: number;
}

const DEFAULT_NEUTRAL_BAND = 0.12;

/** Percentile rank of `value` within `distribution`, 0–100. Ties use the
 *  midrank (fraction below + half equal). Empty/degenerate → 50 (neutral). */
export function percentileRank(value: number, distribution: number[]): number {
  const xs = distribution.filter((v) => Number.isFinite(v));
  if (xs.length === 0 || !Number.isFinite(value)) return 50;
  let below = 0;
  let equal = 0;
  for (const x of xs) {
    if (x < value) below += 1;
    else if (x === value) equal += 1;
  }
  return clamp((below + equal / 2) / xs.length * 100, 0, 100);
}

/** Convert a 0–100 percentile into a signed [-1, 1] value (50 → 0). */
export function percentileToSigned(percentile: number): number {
  return clamp((percentile - 50) / 50, -1, 1);
}

/** z-score of `value` vs a sample; returns 0 when std is 0 or sample empty. */
export function zScore(value: number, sample: number[]): number {
  const xs = sample.filter((v) => Number.isFinite(v));
  if (xs.length < 2 || !Number.isFinite(value)) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (value - mean) / std;
}

/** Squash a z-score to [-1, 1] with a soft tanh-like curve (÷2 then clamp). */
export function squashZ(z: number): number {
  return clamp(z / 2, -1, 1);
}

export function computeCompositeV2(input: CompositeV2Input): CompositeV2Result {
  const weights = REGIME_WEIGHTS_V2[input.regime] ?? REGIME_WEIGHTS_V2.neutral;
  const band = input.neutralBand ?? DEFAULT_NEUTRAL_BAND;

  const available = input.factors.filter((f) => f.available && Number.isFinite(f.signed));
  const weightSum = available.reduce((s, f) => s + (weights[f.factor] ?? 0), 0);

  const contributions: FactorContribution[] = input.factors.map((f) => {
    const applicable = f.available && Number.isFinite(f.signed) && weightSum > 0;
    const weight = applicable ? (weights[f.factor] ?? 0) / weightSum : 0;
    const signed = clamp(f.signed, -1, 1);
    return { factor: f.factor, signed, weight, contribution: applicable ? weight * signed : 0 };
  });

  const directional = weightSum > 0
    ? clamp(contributions.reduce((s, c) => s + c.contribution, 0), -1, 1)
    : 0;

  const rawMagnitude = Math.abs(directional) * 100;
  const evidenceMult = EVIDENCE_MULTIPLIER[input.evidenceQuality];
  const freshnessMult = FRESHNESS_MULTIPLIER[input.freshness ?? 'live'];
  const liquidityMult = clamp(input.liquidityMultiplier ?? 1, 0, 1);
  const appliedMultiplier = evidenceMult * freshnessMult * liquidityMult;

  const composite = Math.round(clamp(rawMagnitude * appliedMultiplier, 0, 100));
  const direction: CompositeV2Result['direction'] =
    directional > band ? 'bullish' : directional < -band ? 'bearish' : 'neutral';

  return {
    composite,
    direction,
    directional,
    rawMagnitude,
    regime: input.regime,
    appliedMultiplier,
    contributions,
    availableFactors: available.length,
  };
}

/** Assign each entry a cross-sectional percentile (0–100) of its composite
 *  within the batch. Returns a new array preserving input order. */
export function crossSectionalPercentiles<T extends { composite: number }>(
  entries: T[],
): Array<T & { percentileRank: number }> {
  const composites = entries.map((e) => e.composite);
  return entries.map((e) => ({ ...e, percentileRank: Math.round(percentileRank(e.composite, composites)) }));
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
