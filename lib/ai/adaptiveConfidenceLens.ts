// lib/ai/adaptiveConfidenceLens.ts
// Adaptive Confidence Lens (ACL) — 5-Step Confidence Pipeline

import type { ConfluenceComponents, ScoringRegime, RegimeScoringResult } from './regimeScoring';

// =====================================================
// TYPES
// =====================================================

export type ACLAuthorization = 'AUTHORIZED' | 'CONDITIONAL' | 'BLOCKED';

export interface ACLPenalty {
  code: string;
  label: string;
  amount: number; // Negative value (e.g., -10)
  active: boolean;
}

export interface ACLHardCap {
  code: string;
  label: string;
  maxConfidence: number;
  active: boolean;
  reason: string;
}

export interface ACLResult {
  /** Final confidence value 0-100 */
  confidence: number;
  /** Authorization gate based on confidence thresholds */
  authorization: ACLAuthorization;
  /** Resource Utilization / Throttle 0-1 (1 = full size, 0.5 = half size) */
  throttle: number;
  /** Human-readable reason codes explaining the result */
  reasonCodes: string[];

  /** Pipeline breakdown for transparency */
  pipeline: {
    step1_base: number;
    step2_regimeMultiplied: number;
    step3_penalized: number;
    step4_capped: number;
    step5_final: number;
  };

  /** All penalties evaluated */
  penalties: ACLPenalty[];
  /** All hard caps evaluated */
  hardCaps: ACLHardCap[];
}

export interface ACLInput {
  /** Weighted score from regime scoring (0-100) */
  weightedScore: number;
  /** Regime confidence (how sure are we of the regime classification) 0-100 */
  regimeConfidence: number;
  /** Current scoring regime */
  regime: ScoringRegime;
  /** Setup type for compatibility check */
  setupType?: 'breakout' | 'mean_reversion' | 'momentum' | 'trend_follow' | 'scalp' | 'swing';

  // Penalty inputs
  eventRisk?: 'none' | 'low' | 'medium' | 'high';
  liquidityQuality?: number; // 0-100
  mtfScore?: number; // 0-100 (from ConfluenceComponents.MTF)
  llScore?: number; // 0-100 (from ConfluenceComponents.LL)
  vaScore?: number; // 0-100 (from ConfluenceComponents.VA)
  correlatedPositions?: number; // Number of correlated open positions
  lateEntry?: boolean; // Is this entry after >60% of the move?
  consecutiveLosses?: number; // Loss streak count
  riskGovernorPermission?: 'ALLOW' | 'ALLOW_REDUCED' | 'ALLOW_TIGHTENED' | 'BLOCK';
}

// =====================================================
// REGIME + SETUP COMPATIBILITY MULTIPLIERS
// =====================================================

type CompatibilityKey = `${ScoringRegime}:${string}`;

const REGIME_SETUP_MULTIPLIERS: Record<string, number> = {
  // Trend Expansion — best for trend-following, good for momentum, breakouts viable
  'TREND_EXPANSION:trend_follow': 1.15,
  'TREND_EXPANSION:momentum': 1.10,
  'TREND_EXPANSION:breakout': 1.05,
  'TREND_EXPANSION:swing': 1.00,
  'TREND_EXPANSION:mean_reversion': 0.75, // Counter-trend in a trend = risky
  'TREND_EXPANSION:scalp': 0.90,

  // Trend Mature — mean reversion starts working, momentum fading
  'TREND_MATURE:mean_reversion': 1.10,
  'TREND_MATURE:swing': 1.05,
  'TREND_MATURE:trend_follow': 0.85, // Late to the party
  'TREND_MATURE:momentum': 0.80,
  'TREND_MATURE:breakout': 0.75,
  'TREND_MATURE:scalp': 0.90,

  // Range Compression — mean reversion king, breakouts dangerous
  'RANGE_COMPRESSION:mean_reversion': 1.15,
  'RANGE_COMPRESSION:scalp': 1.05,
  'RANGE_COMPRESSION:swing': 0.80,
  'RANGE_COMPRESSION:momentum': 0.70,
  'RANGE_COMPRESSION:breakout': 0.65, // False breakout risk very high
  'RANGE_COMPRESSION:trend_follow': 0.60,

  // Vol Expansion — scalps work, everything else needs caution
  'VOL_EXPANSION:scalp': 1.05,
  'VOL_EXPANSION:mean_reversion': 0.85,
  'VOL_EXPANSION:momentum': 0.80,
  'VOL_EXPANSION:breakout': 0.80,
  'VOL_EXPANSION:swing': 0.70,
  'VOL_EXPANSION:trend_follow': 0.75,

  // Transition — everything gets penalized, conservative only
  'TRANSITION:mean_reversion': 0.90,
  'TRANSITION:scalp': 0.85,
  'TRANSITION:swing': 0.80,
  'TRANSITION:trend_follow': 0.75,
  'TRANSITION:momentum': 0.75,
  'TRANSITION:breakout': 0.70,
};

function getCompatibilityMultiplier(regime: ScoringRegime, setupType?: string): number {
  if (!setupType) return 1.0; // No setup type = no adjustment
  const key = `${regime}:${setupType}`;
  return REGIME_SETUP_MULTIPLIERS[key] ?? 0.90; // Default conservative
}

// =====================================================
// PENALTY DEFINITIONS
// =====================================================

function evaluatePenalties(input: ACLInput): ACLPenalty[] {
  const penalties: ACLPenalty[] = [];

  // Event Risk Penalty
  penalties.push({
    code: 'EVENT_RISK',
    label: 'Event Risk (FOMC/CPI/NFP/Earnings)',
    amount: input.eventRisk === 'high' ? -15 : input.eventRisk === 'medium' ? -8 : input.eventRisk === 'low' ? -3 : 0,
    active: input.eventRisk !== undefined && input.eventRisk !== 'none',
  });

  // Liquidity Penalty
  const liqPenalty = input.liquidityQuality !== undefined && input.liquidityQuality < 50
    ? -Math.round((50 - input.liquidityQuality) * 0.4)
    : 0;
  penalties.push({
    code: 'LOW_LIQUIDITY',
    label: 'Below-threshold liquidity',
    amount: liqPenalty,
    active: liqPenalty < 0,
  });

  // MTF Disagreement Penalty
  const mtfPenalty = input.mtfScore !== undefined && input.mtfScore < 40 ? -10 : 0;
  penalties.push({
    code: 'MTF_DISAGREE',
    label: 'Multi-timeframe disagreement',
    amount: mtfPenalty,
    active: mtfPenalty < 0,
  });

  // Liquidity Level Penalty (from ConfluenceComponents.LL)
  const llPenalty = input.llScore !== undefined && input.llScore < 40 ? -8 : 0;
  penalties.push({
    code: 'LL_WEAK',
    label: 'Weak liquidity level score',
    amount: llPenalty,
    active: llPenalty < 0,
  });

  // Volume/Activity Mismatch Penalty
  const vaPenalty = input.vaScore !== undefined && input.vaScore < 35 ? -5 : 0;
  penalties.push({
    code: 'VA_MISMATCH',
    label: 'Volume/activity not confirming',
    amount: vaPenalty,
    active: vaPenalty < 0,
  });

  // Correlation Penalty
  const corrPenalty = input.correlatedPositions !== undefined && input.correlatedPositions >= 2
    ? -(input.correlatedPositions * 5)
    : 0;
  penalties.push({
    code: 'CORRELATION',
    label: 'Correlated position cluster',
    amount: Math.max(corrPenalty, -20), // Cap at -20
    active: corrPenalty < 0,
  });

  // Late Entry Penalty
  penalties.push({
    code: 'LATE_ENTRY',
    label: 'Entry after 60%+ of move completed',
    amount: input.lateEntry ? -10 : 0,
    active: !!input.lateEntry,
  });

  // Loss Streak Penalty
  const streakPenalty = input.consecutiveLosses !== undefined && input.consecutiveLosses >= 3
    ? -(input.consecutiveLosses * 3)
    : 0;
  penalties.push({
    code: 'LOSS_STREAK',
    label: 'Consecutive loss streak active',
    amount: Math.max(streakPenalty, -15), // Cap at -15
    active: streakPenalty < 0,
  });

  return penalties;
}

// =====================================================
// HARD CAP DEFINITIONS
// =====================================================

function evaluateHardCaps(input: ACLInput): ACLHardCap[] {
  const caps: ACLHardCap[] = [];

  // Regime Confidence Cap
  caps.push({
    code: 'REGIME_LOW',
    label: 'Low regime confidence',
    maxConfidence: 60,
    active: input.regimeConfidence < 55,
    reason: `Regime confidence ${input.regimeConfidence.toFixed(0)}% < 55% threshold`,
  });

  // Liquidity Quality Cap
  caps.push({
    code: 'LIQUIDITY_POOR',
    label: 'Poor liquidity quality',
    maxConfidence: 55,
    active: input.liquidityQuality !== undefined && input.liquidityQuality < 45,
    reason: `Liquidity quality ${input.liquidityQuality?.toFixed(0) ?? 'N/A'}% < 45% threshold`,
  });

  // Event Risk Cap
  caps.push({
    code: 'EVENT_HIGH',
    label: 'High event risk active',
    maxConfidence: 50,
    active: input.eventRisk === 'high',
    reason: 'High-impact event risk (FOMC/CPI/NFP/Earnings) caps confidence',
  });

  // Risk Governor Block Cap
  caps.push({
    code: 'GOVERNOR_BLOCK',
    label: 'Risk Governor BLOCK',
    maxConfidence: 0,
    active: input.riskGovernorPermission === 'BLOCK',
    reason: 'Risk Governor has blocked all new entries',
  });

  // Risk Governor Tightened Cap
  caps.push({
    code: 'GOVERNOR_TIGHT',
    label: 'Risk Governor tightened',
    maxConfidence: 65,
    active: input.riskGovernorPermission === 'ALLOW_TIGHTENED',
    reason: 'Risk Governor in tightened mode — reduced conviction ceiling',
  });

  // Risk Governor Reduced Cap
  caps.push({
    code: 'GOVERNOR_REDUCED',
    label: 'Risk Governor reduced',
    maxConfidence: 70,
    active: input.riskGovernorPermission === 'ALLOW_REDUCED',
    reason: 'Risk Governor in reduced mode — conviction ceiling lowered',
  });

  return caps;
}

// =====================================================
// MAIN ACL PIPELINE
// =====================================================

/**
 * Compute Adaptive Confidence Lens — 5-step pipeline
 * 
 * Step 1: Base confidence = 0.55 × WeightedScore + 0.45 × RegimeConfidence
 * Step 2: Regime/Setup compatibility multiplier
 * Step 3: Penalty stack (sum of active penalties)
 * Step 4: Hard caps (lowest active cap wins)
 * Step 5: Authorization + Throttle + ReasonCodes
 */
export function computeACL(input: ACLInput): ACLResult {
  // === STEP 1: Base Confidence ===
  const step1_base = 0.55 * input.weightedScore + 0.45 * input.regimeConfidence;

  // === STEP 2: Regime/Setup Compatibility Multiplier ===
  const multiplier = getCompatibilityMultiplier(input.regime, input.setupType);
  const step2_regimeMultiplied = step1_base * multiplier;

  // === STEP 3: Penalty Stack ===
  const penalties = evaluatePenalties(input);
  const totalPenalty = penalties
    .filter(p => p.active)
    .reduce((sum, p) => sum + p.amount, 0);
  const step3_penalized = Math.max(0, step2_regimeMultiplied + totalPenalty);

  // === STEP 4: Hard Caps ===
  const hardCaps = evaluateHardCaps(input);
  const activeCaps = hardCaps.filter(c => c.active);
  let step4_capped = step3_penalized;
  if (activeCaps.length > 0) {
    const lowestCap = Math.min(...activeCaps.map(c => c.maxConfidence));
    step4_capped = Math.min(step3_penalized, lowestCap);
  }

  // === STEP 5: Authorization + Throttle + ReasonCodes ===
  const step5_final = Math.max(0, Math.min(100, step4_capped));

  let authorization: ACLAuthorization;
  if (step5_final >= 70) {
    authorization = 'AUTHORIZED';
  } else if (step5_final >= 50) {
    authorization = 'CONDITIONAL';
  } else {
    authorization = 'BLOCKED';
  }

  // Risk Governor override: BLOCK always means BLOCKED
  if (input.riskGovernorPermission === 'BLOCK') {
    authorization = 'BLOCKED';
  }

  // Throttle: Resource Utilization 0-1
  // 100 confidence = 1.0, 70 = 0.7, 50 = 0.5, etc.
  // Adjusted by Risk Governor
  let throttle = step5_final / 100;
  if (input.riskGovernorPermission === 'ALLOW_REDUCED') {
    throttle = Math.min(throttle, 0.5);
  } else if (input.riskGovernorPermission === 'ALLOW_TIGHTENED') {
    throttle = Math.min(throttle, 0.35);
  } else if (input.riskGovernorPermission === 'BLOCK') {
    throttle = 0;
  }

  // Build reason codes
  const reasonCodes: string[] = [];
  
  // Authorization reason
  if (authorization === 'BLOCKED') {
    reasonCodes.push(`BLOCKED: Confidence ${step5_final.toFixed(0)}% below 50% threshold`);
  } else if (authorization === 'CONDITIONAL') {
    reasonCodes.push(`CONDITIONAL: Confidence ${step5_final.toFixed(0)}% needs additional confirmation`);
  } else {
    reasonCodes.push(`AUTHORIZED: Confidence ${step5_final.toFixed(0)}% meets threshold`);
  }

  // Setup compatibility reason
  if (multiplier < 0.85) {
    reasonCodes.push(`REGIME_MISMATCH: ${input.setupType} in ${input.regime} (×${multiplier.toFixed(2)})`);
  } else if (multiplier > 1.05) {
    reasonCodes.push(`REGIME_ALIGNED: ${input.setupType} in ${input.regime} (×${multiplier.toFixed(2)})`);
  }

  // Active penalty reasons
  for (const p of penalties.filter(p => p.active)) {
    reasonCodes.push(`PENALTY_${p.code}: ${p.amount}`);
  }

  // Active cap reasons
  for (const c of activeCaps) {
    reasonCodes.push(`CAP_${c.code}: max ${c.maxConfidence}%`);
  }

  return {
    confidence: Number(step5_final.toFixed(1)),
    authorization,
    throttle: Number(throttle.toFixed(3)),
    reasonCodes,
    pipeline: {
      step1_base: Number(step1_base.toFixed(1)),
      step2_regimeMultiplied: Number(step2_regimeMultiplied.toFixed(1)),
      step3_penalized: Number(step3_penalized.toFixed(1)),
      step4_capped: Number(step4_capped.toFixed(1)),
      step5_final: Number(step5_final.toFixed(1)),
    },
    penalties,
    hardCaps,
  };
}

/**
 * Convenience: compute ACL from a RegimeScoringResult + context
 */
export function computeACLFromScoring(
  scoring: RegimeScoringResult,
  opts: {
    regimeConfidence?: number;
    setupType?: ACLInput['setupType'];
    eventRisk?: ACLInput['eventRisk'];
    correlatedPositions?: number;
    lateEntry?: boolean;
    consecutiveLosses?: number;
    riskGovernorPermission?: ACLInput['riskGovernorPermission'];
  } = {}
): ACLResult {
  return computeACL({
    weightedScore: scoring.weightedScore,
    regimeConfidence: opts.regimeConfidence ?? 60, // Default moderate confidence if not provided
    regime: scoring.regime,
    setupType: opts.setupType,
    eventRisk: opts.eventRisk,
    liquidityQuality: scoring.rawComponents.LL,
    mtfScore: scoring.rawComponents.MTF,
    llScore: scoring.rawComponents.LL,
    vaScore: scoring.rawComponents.VA,
    correlatedPositions: opts.correlatedPositions,
    lateEntry: opts.lateEntry,
    consecutiveLosses: opts.consecutiveLosses,
    riskGovernorPermission: opts.riskGovernorPermission,
  });
}
