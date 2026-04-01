/**
 * MSP Operator — Scoring Engine
 * Weighted evidence scoring from §5.2:
 *   confidenceScore = Σ(wi × evidencei) + Σ boosts − Σ penalties
 * Produces a Verdict with Permission tier assignment.
 * @internal
 */

import type {
  ScoringRequest, Verdict, EvidenceScores, Permission, Modifier,
} from '@/types/operator';
import {
  generateId, nowISO, clamp,
  DEFAULT_SCORING_WEIGHTS, PERMISSION_THRESHOLDS,
} from './shared';

type WeightKey = keyof typeof DEFAULT_SCORING_WEIGHTS;

/** Map evidence feature names to scoring weight keys */
function computeEvidenceScores(req: ScoringRequest): EvidenceScores {
  const f = req.featureVector.features;
  const r = req.regimeDecision;

  // regimeFit: how well the regime supports this playbook
  const regimeFit = r.allowedPlaybooks.includes(req.candidate.playbook)
    ? r.confidence * (1 - r.transitionRisk)
    : 0.2;

  return {
    regimeFit: clamp(regimeFit, 0, 1),
    structureQuality: clamp(f.structureScore, 0, 1),
    timeConfluence: clamp(f.timeConfluenceScore, 0, 1),
    volatilityAlignment: clamp((f.volExpansionScore + (1 - f.extensionScore)) / 2, 0, 1),
    participationFlow: clamp(f.relativeVolumeScore, 0, 1),
    crossMarketConfirmation: clamp(f.crossMarketScore, 0, 1),
    eventSafety: clamp(f.eventRiskScore, 0, 1),
    extensionSafety: clamp(1 - f.extensionScore, 0, 1),
    symbolTrust: clamp(req.healthContext.symbolTrustScore, 0, 1),
    modelHealth: clamp(req.healthContext.modelHealthScore, 0, 1),
  };
}

/** Weighted sum per §5.2 scoring formula */
function weightedSum(ev: EvidenceScores, weights: Record<WeightKey, number>): number {
  let sum = 0;
  const map: Record<WeightKey, number> = {
    regimeFit: ev.regimeFit,
    structureQuality: ev.structureQuality,
    timeConfluence: ev.timeConfluence,
    volatilityAlignment: ev.volatilityAlignment,
    participationFlow: ev.participationFlow,
    crossMarketConfirmation: ev.crossMarketConfirmation,
    eventSafety: ev.eventSafety,
    extensionSafety: ev.extensionSafety,
    symbolTrust: ev.symbolTrust,
    modelHealth: ev.modelHealth,
  };
  for (const key of Object.keys(weights) as WeightKey[]) {
    sum += weights[key] * (map[key] ?? 0);
  }
  return sum;
}

/** Map raw confidence → permission tier */
function assignPermission(conf: number): Permission {
  if (conf >= PERMISSION_THRESHOLDS.ALLOW) return 'ALLOW';
  if (conf >= PERMISSION_THRESHOLDS.ALLOW_REDUCED) return 'ALLOW_REDUCED';
  if (conf >= PERMISSION_THRESHOLDS.WAIT) return 'WAIT';
  return 'BLOCK';
}

/** Size multiplier based on permission */
function computeSizeMultiplier(permission: Permission, conf: number): number {
  switch (permission) {
    case 'ALLOW': return 1.0;
    case 'ALLOW_REDUCED': return 0.5;
    case 'WAIT': return 0;
    case 'BLOCK': return 0;
  }
}

/** Risk unit based on ATR and account parameters */
function computeRiskUnit(req: ScoringRequest): number {
  // TODO: wire into actual account risk parameters
  // Default: 1% of notional risk
  return 0.01;
}

/* ── Main Scoring ───────────────────────────────────────────── */

export function scoreCandidate(
  req: ScoringRequest,
  weights: Record<WeightKey, number> = DEFAULT_SCORING_WEIGHTS as Record<WeightKey, number>,
): Verdict {
  const evidence = computeEvidenceScores(req);
  const baseScore = weightedSum(evidence, weights);

  // Collect boosts & penalties from doctrine evaluation
  const boosts: Modifier[] = [...req.doctrineEvaluation.boosts];
  const penalties: Modifier[] = [...req.doctrineEvaluation.penalties];

  // Apply doctrine hard blocks → force BLOCK
  if (req.doctrineEvaluation.hardBlocks.length > 0) {
    const verdict: Verdict = {
      verdictId: generateId('vrd'),
      candidateId: req.candidate.candidateId,
      symbol: req.candidate.symbol,
      market: req.candidate.market,
      timeframe: req.candidate.timeframe,
      timestamp: nowISO(),
      playbook: req.candidate.playbook,
      regime: req.regimeDecision.regime,
      direction: req.candidate.direction,
      confidenceScore: 0,
      qualityScore: baseScore,
      permission: 'BLOCK',
      sizeMultiplier: 0,
      riskUnit: 0,
      entryPlan: {
        entryZone: req.candidate.entryZone,
        triggerPrice: req.candidate.triggerPrice,
        invalidationPrice: req.candidate.invalidationPrice,
        targets: req.candidate.targets,
      },
      evidence,
      boosts,
      penalties,
      reasonCodes: req.doctrineEvaluation.hardBlocks,
    };
    return verdict;
  }

  // Sum modifiers
  const boostSum = boosts.reduce((s, b) => s + b.value, 0);
  const penaltySum = penalties.reduce((s, p) => s + p.value, 0);
  const confidenceScore = clamp(baseScore + boostSum + penaltySum, 0, 1);

  const permission = assignPermission(confidenceScore);
  const sizeMultiplier = computeSizeMultiplier(permission, confidenceScore);
  const riskUnit = computeRiskUnit(req);

  const reasonCodes: string[] = [];
  if (permission === 'BLOCK') reasonCodes.push('SCORE_BELOW_THRESHOLD');
  if (permission === 'WAIT') reasonCodes.push('SCORE_IN_WAIT_ZONE');
  boosts.forEach(b => reasonCodes.push(b.code));
  penalties.forEach(p => reasonCodes.push(p.code));

  return {
    verdictId: generateId('vrd'),
    candidateId: req.candidate.candidateId,
    symbol: req.candidate.symbol,
    market: req.candidate.market,
    timeframe: req.candidate.timeframe,
    timestamp: nowISO(),
    playbook: req.candidate.playbook,
    regime: req.regimeDecision.regime,
    direction: req.candidate.direction,
    confidenceScore,
    qualityScore: baseScore,
    permission,
    sizeMultiplier,
    riskUnit,
    entryPlan: {
      entryZone: req.candidate.entryZone,
      triggerPrice: req.candidate.triggerPrice,
      invalidationPrice: req.candidate.invalidationPrice,
      targets: req.candidate.targets,
    },
    evidence,
    boosts,
    penalties,
    reasonCodes,
  };
}
