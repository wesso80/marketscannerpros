/**
 * Phase 3 — Quant-Style Final Edge Score
 *
 * Final Edge Score =
 *   base_confluence_score
 *   × evidence_quality_multiplier
 *   × data_freshness_multiplier
 *   × regime_fit_multiplier
 *   × historical_edge_multiplier
 *   × sample_confidence_multiplier
 *   × risk_penalty_multiplier
 *   × overfitting_penalty_multiplier
 *
 * Hard rule (enforced in `applyRiskFloors`):
 *   If ANY of the following is true, the final score is capped — high
 *   confluence cannot override these gates:
 *     - data freshness ∈ {stale, simulated, unavailable}
 *     - evidence_quality ∈ {weak, missing}
 *     - sample size < SAMPLE_SIZE_TIERS[0].max (i.e. < 20)
 *
 * Inputs are intentionally narrow primitives (string enums + numbers) so
 * any engine can call this without importing the full brain layer. The
 * Phase 2 brain feature snapshot maps cleanly onto these inputs — see
 * `mapBrainFeaturesToScoringInputs` below.
 *
 * This module is PURE (no DB, no I/O) and is therefore safe to call from
 * Edge runtime, server actions, or unit tests.
 */

// ─── Multiplier tables (single source of truth) ─────────────────────────────

export type EvidenceQuality = 'strong' | 'partial' | 'weak' | 'missing';
export type DataFreshnessTier =
  | 'live'
  | 'cached_valid'
  | 'delayed'
  | 'stale'
  | 'simulated'
  | 'unavailable';

export const EVIDENCE_QUALITY_MULTIPLIER: Record<EvidenceQuality, number> = {
  strong: 1.0,
  partial: 0.85,
  weak: 0.65,
  missing: 0.4,
};

export const DATA_FRESHNESS_MULTIPLIER: Record<DataFreshnessTier, number> = {
  live: 1.0,
  cached_valid: 0.9,
  delayed: 0.7,
  stale: 0.5,
  simulated: 0.25,
  unavailable: 0.1,
};

/** Sample-confidence step function. */
export const SAMPLE_SIZE_TIERS: ReadonlyArray<{ min: number; max: number; mult: number }> = [
  { min: 0, max: 20, mult: 0.3 },
  { min: 20, max: 50, mult: 0.5 },
  { min: 50, max: 100, mult: 0.7 },
  { min: 100, max: 250, mult: 0.85 },
  { min: 250, max: Number.POSITIVE_INFINITY, mult: 1.0 },
];

export function sampleConfidenceMultiplier(sampleSize: number): number {
  for (const tier of SAMPLE_SIZE_TIERS) {
    if (sampleSize >= tier.min && sampleSize < tier.max) return tier.mult;
  }
  return 1.0;
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface RegimeFitInputs {
  /** 0..1 — how well the current regime matches the setup's preferred regime. */
  regimeMatch: number;
  /** Optional per-regime expectancy boost (e.g. 1.10 = +10%). */
  regimeMultiplier?: number;
}

export interface HistoricalEdgeInputs {
  /** Regime-adjusted follow-through rate 0..1 */
  followThroughRate: number;
  /** MFE/MAE ratio (≥ 0). 1.0 is neutral, > 1 favourable. */
  mfeMaeRatio: number;
  /** 0..1 — fraction of past setups that failed before confirmation */
  falsePositiveRate: number;
  /** 0..1 — fraction of past setups that confirmed then failed */
  trapRate: number;
  /** Worst MAE % observed (negative number, e.g. -8.4). */
  drawdownSensitivity: number;
}

export interface RiskInputs {
  /** Earnings/event/news risk active. */
  catalystRisk?: boolean;
  /** Liquidity-constrained (thin book / low rel_volume / pre-market). */
  liquidityConstrained?: boolean;
  /** Trader is in a drawdown / throttle level. */
  performanceThrottled?: boolean;
  /** ARCA explicitly downgraded the verdict. */
  arcaDowngraded?: boolean;
}

export interface OverfittingInputs {
  /** How many distinct conditioning dimensions are baked into the setup. */
  conditioningDimensions: number;
  /** True if setup only ever fired on a single symbol. */
  singleSymbolOnly?: boolean;
  /** True if setup only ever fired on a single timeframe. */
  singleTimeframeOnly?: boolean;
  /** True if setup only ever fired in a single regime. */
  singleRegimeOnly?: boolean;
  /** Number of stacked filters in the rule (>5 starts penalising). */
  filterStackCount?: number;
  /**
   * Walk-forward degradation ratio: walk_forward_winrate / in_sample_winrate.
   * <1 means the rule fails out-of-sample. Default 1 (no degradation).
   */
  walkForwardRatio?: number;
}

export interface FinalEdgeInputs {
  /** 0..1 base confluence score from the rules engine. */
  baseConfluenceScore: number;
  evidenceQuality: EvidenceQuality;
  dataFreshness: DataFreshnessTier;
  regimeFit: RegimeFitInputs;
  historicalEdge?: HistoricalEdgeInputs;     // optional — falls back to neutral 1.0
  sampleSize: number;
  risk?: RiskInputs;
  overfitting: OverfittingInputs;
}

// ─── Component multipliers ───────────────────────────────────────────────────

export function regimeFitMultiplier(inputs: RegimeFitInputs): number {
  const match = clamp01(inputs.regimeMatch);
  // 0 → 0.5, 0.5 → 0.85, 1 → 1.0 + optional boost
  const base = 0.5 + 0.5 * match;
  const adj = (inputs.regimeMultiplier ?? 1) * base;
  return clamp(adj, 0.4, 1.2);
}

export function historicalEdgeMultiplier(inputs?: HistoricalEdgeInputs): number {
  if (!inputs) return 1.0;
  const ft = clamp01(inputs.followThroughRate);
  // Centered at 0.5 follow-through = 1.0; 0.7 → ~1.20; 0.3 → ~0.70
  const followComponent = 0.4 + 1.2 * ft;

  const ratioComponent =
    inputs.mfeMaeRatio <= 0
      ? 0.5
      : inputs.mfeMaeRatio < 1
        ? 0.7 + 0.3 * inputs.mfeMaeRatio
        : Math.min(1.4, 1 + (inputs.mfeMaeRatio - 1) * 0.2);

  const failPenalty = 1 - clamp01(inputs.falsePositiveRate) * 0.5;
  const trapPenalty = 1 - clamp01(inputs.trapRate) * 0.6;

  const ddPenalty =
    inputs.drawdownSensitivity >= 0
      ? 1
      : Math.max(0.5, 1 + inputs.drawdownSensitivity / 50); // -10% MAE → 0.80; -25% → 0.50

  const composed = followComponent * ratioComponent * failPenalty * trapPenalty * ddPenalty;
  return clamp(composed, 0.3, 1.4);
}

export function riskPenaltyMultiplier(risk?: RiskInputs): number {
  if (!risk) return 1.0;
  let m = 1.0;
  if (risk.catalystRisk) m *= 0.85;
  if (risk.liquidityConstrained) m *= 0.85;
  if (risk.performanceThrottled) m *= 0.8;
  if (risk.arcaDowngraded) m *= 0.7;
  return clamp(m, 0.3, 1.0);
}

export function overfittingPenaltyMultiplier(o: OverfittingInputs): number {
  let m = 1.0;
  // Single-axis specialisation penalties
  if (o.singleSymbolOnly) m *= 0.7;
  if (o.singleTimeframeOnly) m *= 0.85;
  if (o.singleRegimeOnly) m *= 0.85;
  // Filter stacking — > 5 stacked filters starts penalising
  const stack = o.filterStackCount ?? 0;
  if (stack > 5) m *= Math.max(0.6, 1 - (stack - 5) * 0.05);
  // Conditioning dimensions penalty (gentle linear)
  if (o.conditioningDimensions > 3) {
    m *= Math.max(0.7, 1 - (o.conditioningDimensions - 3) * 0.05);
  }
  // Walk-forward degradation — the harshest signal
  if (o.walkForwardRatio !== undefined && o.walkForwardRatio < 1) {
    const ratio = Math.max(0, o.walkForwardRatio);
    m *= Math.max(0.4, ratio); // 0.6 in-sample/out-of-sample → 0.6 mult
  }
  return clamp(m, 0.3, 1.0);
}

// ─── Risk floors (enforced after multiplication) ─────────────────────────────

export interface RiskFloorResult {
  capped: boolean;
  cap: number;
  reasons: string[];
}

export function applyRiskFloors(input: FinalEdgeInputs): RiskFloorResult {
  const reasons: string[] = [];
  let cap = 1.0;

  // Freshness gate
  if (input.dataFreshness === 'unavailable') {
    cap = Math.min(cap, 0.1);
    reasons.push('data_unavailable_cap');
  } else if (input.dataFreshness === 'simulated') {
    cap = Math.min(cap, 0.25);
    reasons.push('simulated_data_cap');
  } else if (input.dataFreshness === 'stale') {
    cap = Math.min(cap, 0.45);
    reasons.push('stale_data_cap');
  }

  // Evidence gate
  if (input.evidenceQuality === 'missing') {
    cap = Math.min(cap, 0.35);
    reasons.push('missing_evidence_cap');
  } else if (input.evidenceQuality === 'weak') {
    cap = Math.min(cap, 0.55);
    reasons.push('weak_evidence_cap');
  }

  // Sample-size gate — < 20 samples can never publish strong confidence
  if (input.sampleSize < 20) {
    cap = Math.min(cap, 0.35);
    reasons.push('insufficient_sample_cap');
  }

  return { capped: cap < 1.0, cap, reasons };
}

// ─── Final composition ───────────────────────────────────────────────────────

export interface FinalEdgeResult {
  finalEdgeScore: number;            // 0..1
  baseConfluenceScore: number;
  multipliers: {
    evidenceQuality: number;
    dataFreshness: number;
    regimeFit: number;
    historicalEdge: number;
    sampleConfidence: number;
    riskPenalty: number;
    overfittingPenalty: number;
  };
  preCapScore: number;
  cap: number;
  capped: boolean;
  capReasons: string[];
  /** UI-safe label derived from final score AND sample size simultaneously. */
  tier: 'noise' | 'weak' | 'emerging' | 'strong' | 'elite' | 'insufficient_sample';
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceReason: string;
}

export function computeFinalEdgeScore(input: FinalEdgeInputs): FinalEdgeResult {
  const base = clamp01(input.baseConfluenceScore);

  const evidenceMult = EVIDENCE_QUALITY_MULTIPLIER[input.evidenceQuality];
  const freshnessMult = DATA_FRESHNESS_MULTIPLIER[input.dataFreshness];
  const regimeMult = regimeFitMultiplier(input.regimeFit);
  const historicalMult = historicalEdgeMultiplier(input.historicalEdge);
  const sampleMult = sampleConfidenceMultiplier(input.sampleSize);
  const riskMult = riskPenaltyMultiplier(input.risk);
  const overfitMult = overfittingPenaltyMultiplier(input.overfitting);

  const product =
    base *
    evidenceMult *
    freshnessMult *
    regimeMult *
    historicalMult *
    sampleMult *
    riskMult *
    overfitMult;
  const preCap = clamp01(product);

  const floor = applyRiskFloors(input);
  const final = clamp01(Math.min(preCap, floor.cap));

  // Tier — sample size is a hard ceiling (mirrors brain edge scorer)
  const tier: FinalEdgeResult['tier'] = (() => {
    if (input.sampleSize < 10) return 'insufficient_sample';
    if (final >= 0.7 && input.sampleSize >= 100) return 'elite';
    if (final >= 0.55 && input.sampleSize >= 50) return 'strong';
    if (final >= 0.4 && input.sampleSize >= 20) return 'emerging';
    if (final >= 0.2) return 'weak';
    return 'noise';
  })();

  const confidenceLabel: FinalEdgeResult['confidenceLabel'] =
    input.sampleSize >= 100 && final >= 0.6
      ? 'high'
      : input.sampleSize >= 30 && final >= 0.35
        ? 'medium'
        : 'low';

  const reasonParts: string[] = [
    `base=${base.toFixed(2)}`,
    `evidence=${input.evidenceQuality}(${evidenceMult.toFixed(2)})`,
    `freshness=${input.dataFreshness}(${freshnessMult.toFixed(2)})`,
    `regime_fit=${regimeMult.toFixed(2)}`,
    `historical=${historicalMult.toFixed(2)}`,
    `sample=${input.sampleSize}(${sampleMult.toFixed(2)})`,
    `risk=${riskMult.toFixed(2)}`,
    `overfit=${overfitMult.toFixed(2)}`,
  ];
  if (floor.capped) reasonParts.push(`cap=${floor.cap.toFixed(2)}[${floor.reasons.join(',')}]`);

  return {
    finalEdgeScore: final,
    baseConfluenceScore: base,
    multipliers: {
      evidenceQuality: evidenceMult,
      dataFreshness: freshnessMult,
      regimeFit: regimeMult,
      historicalEdge: historicalMult,
      sampleConfidence: sampleMult,
      riskPenalty: riskMult,
      overfittingPenalty: overfitMult,
    },
    preCapScore: preCap,
    cap: floor.cap,
    capped: floor.capped,
    capReasons: floor.reasons,
    tier,
    confidenceLabel,
    confidenceReason: reasonParts.join(' | '),
  };
}

// ─── Brain-layer adapters (optional helpers) ─────────────────────────────────

import type {
  BrainFeatureSnapshot,
  EdgeScore as BrainEdgeScore,
  DataFreshness as BrainDataFreshness,
} from './types';

/** Map brain feature snapshot freshness → scoring tier. */
export function mapBrainFreshness(
  freshness: BrainDataFreshness,
  isCached = false,
): DataFreshnessTier {
  switch (freshness) {
    case 'real-time':
      return 'live';
    case 'delayed':
      return 'delayed';
    case 'stale':
      return 'stale';
    case 'simulated':
      return 'simulated';
    case 'unknown':
      return isCached ? 'cached_valid' : 'unavailable';
  }
}

/**
 * Convert a brain feature snapshot's data-quality flags into an evidence
 * quality bucket. Conservative — any missing-critical-options flag and
 * we drop straight to 'weak' or 'missing'.
 */
export function mapBrainEvidenceQuality(snap: BrainFeatureSnapshot): EvidenceQuality {
  const optionsMissing = snap.options.options_data_missing === true;
  const derivMissing = snap.derivatives.derivatives_data_missing === true;
  const missingCount = snap.missingDataCount ?? 0;
  const staleCount = snap.staleDataCount ?? 0;

  if ((optionsMissing && derivMissing) || missingCount >= 8) return 'missing';
  if (optionsMissing || derivMissing || missingCount >= 4 || staleCount >= 4) return 'weak';
  if (missingCount >= 1 || staleCount >= 1) return 'partial';
  return 'strong';
}

/**
 * Pull historical-edge inputs straight from a persisted brain edge score.
 * Falls back to neutral if fields are null.
 */
export function mapBrainEdgeToHistorical(edge: BrainEdgeScore): HistoricalEdgeInputs | undefined {
  if (edge.sampleSize === 0) return undefined;
  return {
    followThroughRate: edge.winRate ?? 0.5,
    mfeMaeRatio: edge.mfeMaeRatio ?? 1,
    falsePositiveRate: edge.falsePositiveRate ?? 0,
    trapRate: edge.trapRate ?? 0,
    drawdownSensitivity: edge.drawdownSensitivity ?? 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
