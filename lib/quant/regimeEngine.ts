/**
 * Layer 1 — Unified Regime Engine
 *
 * Fuses regime signals from 4 independent sources:
 *   1. DVE (Directional Volatility Engine) — vol regime from BBWP
 *   2. MRI (Market Regime Intel) — derivatives-based regime
 *   3. Institutional Flow State — accumulation / positioning / launch / exhaustion
 *   4. Capital Flow Engine — market mode (pin / launch / chop)
 *
 * Produces a single UnifiedRegimeState with phase, confidence, and agreement score.
 */

import type { MarketPhase, RegimeConfidenceBand, UnifiedRegimeState } from './types';

// ─── Source regime → MarketPhase mapping tables ─────────────────────────────

const DVE_REGIME_MAP: Record<string, MarketPhase> = {
  compression: 'RANGE_COMPRESSION',
  neutral: 'RANGE_NEUTRAL',
  transition: 'RANGE_NEUTRAL',
  expansion: 'VOL_EXPANSION',
  climax: 'VOL_CLIMAX',
};

const MRI_REGIME_MAP: Record<string, MarketPhase> = {
  TREND: 'TREND_UP',     // Direction disambiguated below
  RANGE: 'RANGE_NEUTRAL',
  EXPANSION: 'VOL_EXPANSION',
  REVERSAL: 'RANGE_NEUTRAL', // Reversal is ambiguous; treat as neutral
};

const FLOW_STATE_MAP: Record<string, MarketPhase> = {
  ACCUMULATION: 'RANGE_COMPRESSION',
  POSITIONING: 'TREND_UP',     // Direction disambiguated below
  LAUNCH: 'VOL_EXPANSION',
  EXHAUSTION: 'VOL_CLIMAX',
};

const CAPITAL_FLOW_MODE_MAP: Record<string, MarketPhase> = {
  pin: 'RANGE_NEUTRAL',
  launch: 'VOL_EXPANSION',
  chop: 'RANGE_NEUTRAL',
};

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface RegimeSourceInputs {
  dve?: {
    regime: string;    // compression | neutral | transition | expansion | climax
    bbwp: number;
    confidence: number;
    directionalBias?: 'bullish' | 'bearish' | 'neutral';
  };
  mri?: {
    regime: string;    // TREND | RANGE | EXPANSION | REVERSAL
    confidence: number;
    direction?: 'bullish' | 'bearish' | 'neutral';
  };
  flowState?: {
    state: string;     // ACCUMULATION | POSITIONING | LAUNCH | EXHAUSTION
    confidence: number;
    bias?: 'bullish' | 'bearish' | 'neutral';
  };
  capitalFlow?: {
    mode: string;      // pin | launch | chop
    bias: string;      // bullish | bearish | neutral
    conviction: number;
  };
}

// ─── Engine ─────────────────────────────────────────────────────────────────

function resolveDirection(inputs: RegimeSourceInputs): 'bullish' | 'bearish' | 'neutral' {
  let bullish = 0;
  let bearish = 0;

  if (inputs.dve?.directionalBias === 'bullish') bullish++;
  else if (inputs.dve?.directionalBias === 'bearish') bearish++;

  if (inputs.mri?.direction === 'bullish') bullish++;
  else if (inputs.mri?.direction === 'bearish') bearish++;

  if (inputs.flowState?.bias === 'bullish') bullish++;
  else if (inputs.flowState?.bias === 'bearish') bearish++;

  if (inputs.capitalFlow?.bias === 'bullish') bullish++;
  else if (inputs.capitalFlow?.bias === 'bearish') bearish++;

  if (bullish > bearish && bullish >= 2) return 'bullish';
  if (bearish > bullish && bearish >= 2) return 'bearish';
  return 'neutral';
}

function mapToPhase(raw: MarketPhase, direction: 'bullish' | 'bearish' | 'neutral'): MarketPhase {
  if (raw === 'TREND_UP' && direction === 'bearish') return 'TREND_DOWN';
  return raw;
}

function phaseFamily(phase: MarketPhase): string {
  if (phase === 'TREND_UP' || phase === 'TREND_DOWN') return 'TREND';
  if (phase === 'RANGE_COMPRESSION' || phase === 'RANGE_NEUTRAL') return 'RANGE';
  if (phase === 'VOL_EXPANSION' || phase === 'VOL_CLIMAX') return 'VOL';
  return 'RISK';
}

export function computeUnifiedRegime(inputs: RegimeSourceInputs): UnifiedRegimeState {
  const direction = resolveDirection(inputs);

  // Map each source to a MarketPhase
  const votes: Array<{ phase: MarketPhase; confidence: number; source: string }> = [];

  if (inputs.dve) {
    const raw = DVE_REGIME_MAP[inputs.dve.regime] ?? 'RANGE_NEUTRAL';
    votes.push({ phase: mapToPhase(raw, direction), confidence: inputs.dve.confidence, source: 'dve' });
  }
  if (inputs.mri) {
    const raw = MRI_REGIME_MAP[inputs.mri.regime] ?? 'RANGE_NEUTRAL';
    votes.push({ phase: mapToPhase(raw, direction), confidence: inputs.mri.confidence, source: 'mri' });
  }
  if (inputs.flowState) {
    const raw = FLOW_STATE_MAP[inputs.flowState.state] ?? 'RANGE_NEUTRAL';
    votes.push({ phase: mapToPhase(raw, direction), confidence: inputs.flowState.confidence, source: 'flowState' });
  }
  if (inputs.capitalFlow) {
    const raw = CAPITAL_FLOW_MODE_MAP[inputs.capitalFlow.mode] ?? 'RANGE_NEUTRAL';
    votes.push({ phase: mapToPhase(raw, direction), confidence: inputs.capitalFlow.conviction, source: 'capitalFlow' });
  }

  if (votes.length === 0) {
    return {
      phase: 'RANGE_NEUTRAL',
      confidence: 0,
      confidenceBand: 'LOW',
      sources: { dve: null, mri: null, flowState: null, capitalFlow: null },
      agreement: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // Weighted vote — higher-confidence sources get more say
  const familyScores: Record<string, number> = {};
  const phaseScores: Record<string, number> = {};

  for (const v of votes) {
    const fam = phaseFamily(v.phase);
    familyScores[fam] = (familyScores[fam] ?? 0) + v.confidence;
    phaseScores[v.phase] = (phaseScores[v.phase] ?? 0) + v.confidence;
  }

  // Pick winning phase (highest weighted votes)
  let winningPhase: MarketPhase = 'RANGE_NEUTRAL';
  let maxScore = 0;
  for (const [phase, score] of Object.entries(phaseScores)) {
    if (score > maxScore) {
      maxScore = score;
      winningPhase = phase as MarketPhase;
    }
  }

  // Agreement: how many sources fall into the same family as the winning phase
  const winFamily = phaseFamily(winningPhase);
  const agreement = votes.filter(v => phaseFamily(v.phase) === winFamily).length;

  // Unified confidence: weighted average of agreeing sources, penalized if low agreement
  const agreeingVotes = votes.filter(v => phaseFamily(v.phase) === winFamily);
  const avgConfidence = agreeingVotes.reduce((s, v) => s + v.confidence, 0) / agreeingVotes.length;
  const agreementPenalty = agreement < 2 ? 0.6 : agreement < 3 ? 0.8 : 1.0;
  const finalConfidence = Math.round(Math.min(100, avgConfidence * agreementPenalty));

  const confidenceBand: RegimeConfidenceBand =
    agreement === votes.length && finalConfidence >= 70 ? 'HIGH' :
    agreement >= Math.ceil(votes.length / 2) && finalConfidence >= 50 ? 'MODERATE' :
    agreement < Math.ceil(votes.length / 2) ? 'CONFLICTING' : 'LOW';

  // Risk-off override: if any source signals extreme stress
  const isRiskOff =
    (inputs.dve?.regime === 'climax' && (inputs.dve.confidence ?? 0) > 80) ||
    (inputs.flowState?.state === 'EXHAUSTION' && (inputs.flowState.confidence ?? 0) > 75);

  return {
    phase: isRiskOff ? 'RISK_OFF' : winningPhase,
    confidence: finalConfidence,
    confidenceBand: isRiskOff ? 'HIGH' : confidenceBand,
    sources: {
      dve: inputs.dve ? { regime: inputs.dve.regime, bbwp: inputs.dve.bbwp, confidence: inputs.dve.confidence } : null,
      mri: inputs.mri ? { regime: inputs.mri.regime, confidence: inputs.mri.confidence } : null,
      flowState: inputs.flowState ? { state: inputs.flowState.state, confidence: inputs.flowState.confidence } : null,
      capitalFlow: inputs.capitalFlow ? { mode: inputs.capitalFlow.mode, bias: inputs.capitalFlow.bias, conviction: inputs.capitalFlow.conviction } : null,
    },
    agreement,
    timestamp: new Date().toISOString(),
  };
}
