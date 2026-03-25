/**
 * Layer 4 — Permission Engine
 * @internal — NEVER import into user-facing components.
 *
 * Adjudicates whether a scored candidate should be acted upon.
 * Uses hard gates (binary pass/fail) and soft gates (scored thresholds)
 * to determine the PermissionLevel:
 *
 *   BLOCK       — Any hard gate failed
 *   MONITOR     — Fusion < threshold or regime conflicting
 *   READY       — All hard gates pass, soft gates partial
 *   GO          — All hard gates pass, strong soft gates
 *   PRIORITY_GO — All 9 dimensions above threshold simultaneously (rare)
 */

import type { DiscoveryCandidate, FusionScore, HardGate, PermissionLevel, PermissionResult, SoftGate, UnifiedRegimeState } from './types';
import { DEFAULT_QUANT_CONFIG } from './types';
import { shouldBlockForCatalyst } from './catalystGate';

// ─── Hard Gates (binary) ────────────────────────────────────────────────────

function evaluateHardGates(
  score: FusionScore,
  regime: UnifiedRegimeState,
  candidate?: DiscoveryCandidate,
): HardGate[] {
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

  // 6. Catalyst proximity — block if earnings within 2 days (equity only)
  if (candidate?.catalystProximity) {
    const blocked = shouldBlockForCatalyst(candidate.catalystProximity, 2);
    gates.push({
      name: 'catalyst_proximity',
      passed: !blocked,
      reason: blocked
        ? `Earnings in ${candidate.catalystProximity.daysToEarnings} day(s) — too risky`
        : candidate.catalystProximity.hasEarnings
          ? `Earnings in ${candidate.catalystProximity.daysToEarnings} days (outside block window)`
          : 'No imminent catalyst',
    });
  }

  // 7. DVE exhaustion — block if exhaustion is extreme
  if (candidate?.fullDve) {
    const extremeExhaustion = candidate.fullDve.exhaustionLevel >= 85;
    gates.push({
      name: 'dve_exhaustion',
      passed: !extremeExhaustion,
      reason: extremeExhaustion
        ? `Extreme exhaustion (${candidate.fullDve.exhaustionLevel}) — move likely spent`
        : `Exhaustion: ${candidate.fullDve.exhaustionLabel} (${candidate.fullDve.exhaustionLevel})`,
    });
  }

  return gates;
}

// ─── Soft Gates (scored) ────────────────────────────────────────────────────

function evaluateSoftGates(
  score: FusionScore,
  regime: UnifiedRegimeState,
  candidate?: DiscoveryCandidate,
): SoftGate[] {
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

  // 6. Pressure alignment (V2) — MPE pressure supports the trade
  const pressureDim = score.dimensions.find(d => d.name === 'pressure');
  if (pressureDim) {
    gates.push({
      name: 'pressure_alignment',
      score: pressureDim.normalized,
      threshold: 50,
      passed: pressureDim.normalized >= 50,
      reason: `Pressure: ${pressureDim.normalized.toFixed(0)}`,
    });
  }

  // 7. Trap risk (V2) — lower is better (penalizes false breakout risk)
  if (candidate?.fullDve && candidate.fullDve.trapScore > 0) {
    const trapSafe = candidate.fullDve.trapScore < 60;
    gates.push({
      name: 'trap_risk',
      score: 100 - candidate.fullDve.trapScore, // Invert: high trap = low score
      threshold: 40,
      passed: trapSafe,
      reason: trapSafe
        ? `Trap risk low (${candidate.fullDve.trapScore})`
        : `Elevated trap risk (${candidate.fullDve.trapScore}) — potential false breakout`,
    });
  }

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
  candidate?: DiscoveryCandidate,
): PermissionResult {
  const hardGates = evaluateHardGates(score, regime, candidate);
  const softGates = evaluateSoftGates(score, regime, candidate);
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
  candidates?: DiscoveryCandidate[],
): PermissionResult[] {
  // Build symbol → candidate lookup for enriched gate data
  const candidateMap = new Map<string, DiscoveryCandidate>();
  if (candidates) {
    for (const c of candidates) candidateMap.set(c.symbol, c);
  }

  return scores
    .map(s => evaluatePermission(s, regime, config, candidateMap.get(s.symbol)))
    .filter(p => p.level !== 'BLOCK')
    .sort((a, b) => {
      const levelOrder: Record<PermissionLevel, number> = {
        PRIORITY_GO: 5, GO: 4, READY: 3, MONITOR: 2, BLOCK: 1,
      };
      return (levelOrder[b.level] ?? 0) - (levelOrder[a.level] ?? 0);
    });
}
