/**
 * Layer 4 — Permission Engine
 *
 * Adjudicates whether a scored candidate should be acted upon.
 * Uses hard gates (binary pass/fail) and soft gates (scored thresholds)
 * to determine the PermissionLevel:
 *
 *   BLOCK       — Any hard gate failed
 *   MONITOR     — Fusion < threshold or regime conflicting
 *   READY       — All hard gates pass, soft gates partial
 *   GO          — All hard gates pass, strong soft gates
 *   PRIORITY_GO — All 8 dimensions above threshold simultaneously (rare)
 */

import type { FusionScore, HardGate, PermissionLevel, PermissionResult, SoftGate, UnifiedRegimeState } from './types';
import { DEFAULT_QUANT_CONFIG } from './types';

// ─── Hard Gates (binary) ────────────────────────────────────────────────────

function evaluateHardGates(score: FusionScore, regime: UnifiedRegimeState): HardGate[] {
  const gates: HardGate[] = [];

  // 1. Regime clarity — must not be CONFLICTING with low confidence
  gates.push({
    name: 'regime_clarity',
    passed: !(regime.confidenceBand === 'CONFLICTING' && regime.confidence < 30),
    reason: regime.confidenceBand === 'CONFLICTING' && regime.confidence < 30
      ? `Regime conflicting (${regime.confidence}% confidence)`
      : `Regime: ${regime.phase} (${regime.confidence}%)`,
  });

  // 2. Risk-off override — RISK_OFF regime blocks everything
  gates.push({
    name: 'risk_off',
    passed: regime.phase !== 'RISK_OFF',
    reason: regime.phase === 'RISK_OFF'
      ? 'RISK_OFF regime active — all signals blocked'
      : 'No risk-off condition',
  });

  // 3. Data freshness — stale data = no trade
  const freshnessDim = score.dimensions.find(d => d.name === 'freshness');
  const freshnessScore = freshnessDim?.normalized ?? 0;
  gates.push({
    name: 'data_freshness',
    passed: freshnessScore >= 30,
    reason: freshnessScore < 30
      ? `Data too stale (freshness: ${freshnessScore})`
      : `Data fresh enough (${freshnessScore})`,
  });

  // 4. Directional clarity — must have a direction
  gates.push({
    name: 'directional_clarity',
    passed: score.direction !== 'NEUTRAL',
    reason: score.direction === 'NEUTRAL'
      ? 'No directional edge detected'
      : `Direction: ${score.direction} (${score.directionConfidence.toFixed(0)}%)`,
  });

  // 5. Minimum composite — prevent noise from passing
  gates.push({
    name: 'minimum_composite',
    passed: score.composite >= 40,
    reason: score.composite < 40
      ? `Fusion score too low (${score.composite.toFixed(1)})`
      : `Fusion score: ${score.composite.toFixed(1)}`,
  });

  return gates;
}

// ─── Soft Gates (scored) ────────────────────────────────────────────────────

function evaluateSoftGates(score: FusionScore, regime: UnifiedRegimeState): SoftGate[] {
  const gates: SoftGate[] = [];

  // 1. Regime agreement (want ≥ 3 of 4 sources agreeing)
  gates.push({
    name: 'regime_agreement',
    score: regime.agreement * 25,
    threshold: 50,
    passed: regime.agreement >= 2,
    reason: `${regime.agreement}/4 sources agree on regime`,
  });

  // 2. Structure quality
  const structureDim = score.dimensions.find(d => d.name === 'structure');
  gates.push({
    name: 'structure_quality',
    score: structureDim?.normalized ?? 0,
    threshold: 55,
    passed: (structureDim?.normalized ?? 0) >= 55,
    reason: `Structure: ${(structureDim?.normalized ?? 0).toFixed(0)}`,
  });

  // 3. Volatility positioning
  const volDim = score.dimensions.find(d => d.name === 'volatility');
  gates.push({
    name: 'volatility_positioning',
    score: volDim?.normalized ?? 0,
    threshold: 50,
    passed: (volDim?.normalized ?? 0) >= 50,
    reason: `Volatility: ${(volDim?.normalized ?? 0).toFixed(0)}`,
  });

  // 4. Momentum alignment
  const momDim = score.dimensions.find(d => d.name === 'momentum');
  gates.push({
    name: 'momentum_alignment',
    score: momDim?.normalized ?? 0,
    threshold: 55,
    passed: (momDim?.normalized ?? 0) >= 55,
    reason: `Momentum: ${(momDim?.normalized ?? 0).toFixed(0)}`,
  });

  // 5. Participation / flow
  const partDim = score.dimensions.find(d => d.name === 'participation');
  gates.push({
    name: 'participation',
    score: partDim?.normalized ?? 0,
    threshold: 50,
    passed: (partDim?.normalized ?? 0) >= 50,
    reason: `Participation: ${(partDim?.normalized ?? 0).toFixed(0)}`,
  });

  return gates;
}

// ─── Permission Level Adjudication ──────────────────────────────────────────

function adjudicatePermission(
  hardGates: HardGate[],
  softGates: SoftGate[],
  fusionScore: number,
  config = DEFAULT_QUANT_CONFIG,
): PermissionLevel {
  // Any hard gate failure = BLOCK
  if (hardGates.some(g => !g.passed)) return 'BLOCK';

  const softPassed = softGates.filter(g => g.passed).length;
  const softTotal = softGates.length;

  // PRIORITY_GO: fusion ≥ 85 AND all soft gates pass
  if (fusionScore >= config.priorityThreshold && softPassed === softTotal) {
    return 'PRIORITY_GO';
  }

  // GO: fusion ≥ 70 AND most soft gates pass
  if (fusionScore >= 70 && softPassed >= Math.ceil(softTotal * 0.8)) {
    return 'GO';
  }

  // READY: fusion ≥ threshold AND half soft gates pass
  if (fusionScore >= config.fusionThreshold && softPassed >= Math.ceil(softTotal * 0.5)) {
    return 'READY';
  }

  // MONITOR: has potential but not enough confluence
  return 'MONITOR';
}

// ─── Main Permission Function ───────────────────────────────────────────────

export function evaluatePermission(
  score: FusionScore,
  regime: UnifiedRegimeState,
  config = DEFAULT_QUANT_CONFIG,
): PermissionResult {
  const hardGates = evaluateHardGates(score, regime);
  const softGates = evaluateSoftGates(score, regime);
  const level = adjudicatePermission(hardGates, softGates, score.composite, config);

  return {
    symbol: score.symbol,
    level,
    hardGates,
    softGates,
    hardGatesPassed: hardGates.filter(g => g.passed).length,
    hardGatesTotal: hardGates.length,
    softGateScore: softGates.length > 0
      ? softGates.reduce((s, g) => s + g.score, 0) / softGates.length
      : 0,
    fusionScore: score.composite,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate permissions for all scored candidates.
 * Returns only those at MONITOR level or above (filters out BLOCK).
 */
export function evaluateAll(
  scores: FusionScore[],
  regime: UnifiedRegimeState,
  config = DEFAULT_QUANT_CONFIG,
): PermissionResult[] {
  return scores
    .map(s => evaluatePermission(s, regime, config))
    .filter(p => p.level !== 'BLOCK')
    .sort((a, b) => {
      const levelOrder: Record<PermissionLevel, number> = {
        PRIORITY_GO: 5, GO: 4, READY: 3, MONITOR: 2, BLOCK: 1,
      };
      return (levelOrder[b.level] ?? 0) - (levelOrder[a.level] ?? 0);
    });
}
