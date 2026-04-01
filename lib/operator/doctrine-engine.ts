/**
 * MSP Operator — Doctrine Engine
 * Applies hard trading beliefs as machine-enforced rules.
 * Hard blocks (non-negotiable) vs boosts/penalties (evidence modifiers).
 * @internal
 */

import type {
  DoctrineEvalRequest, DoctrineEvaluation, Modifier,
} from '@/types/operator';

/** ── Hard Rules: any failure → BLOCK ────────────────────────── */

function checkHardBlocks(req: DoctrineEvalRequest): string[] {
  const blocks: string[] = [];
  const f = req.featureVector.features;
  const r = req.regimeDecision;
  const c = req.candidateContext;

  // Never trade ILLIQUID_DRIFT or PANIC_CORRELATION_CASCADE
  if (r.regime === 'ILLIQUID_DRIFT') {
    blocks.push('HARD_BLOCK:ILLIQUID_DRIFT');
  }
  if (r.regime === 'PANIC_CORRELATION_CASCADE') {
    blocks.push('HARD_BLOCK:PANIC_CASCADE');
  }

  // Never trade against a blocked playbook for this regime
  if (r.blockedPlaybooks.includes(c.playbook)) {
    blocks.push(`HARD_BLOCK:PLAYBOOK_BLOCKED_IN_${r.regime}`);
  }

  // Never trade if event-risk window is extremely hostile
  if (f.eventRiskScore < 0.15) {
    blocks.push('HARD_BLOCK:EVENT_RISK_EXTREME');
  }

  // Never trade if relative volume is negligible (no participation)
  if (f.relativeVolumeScore < 0.1) {
    blocks.push('HARD_BLOCK:NO_PARTICIPATION');
  }

  // Never trade if structure quality is too weak
  if (f.structureScore < 0.15) {
    blocks.push('HARD_BLOCK:STRUCTURE_ABSENT');
  }

  // Never trade breakouts in compression with low vol
  if (c.playbook === 'BREAKOUT_CONTINUATION' && f.volExpansionScore < 0.2) {
    blocks.push('HARD_BLOCK:BREAKOUT_NO_EXPANSION');
  }

  // Invalidation must be defined (non-zero)
  if (c.invalidationPrice <= 0) {
    blocks.push('HARD_BLOCK:NO_INVALIDATION');
  }

  return blocks;
}

/** ── Required Confirmations: log but don't block ───────────── */

function checkConfirmations(req: DoctrineEvalRequest): string[] {
  const confirmations: string[] = [];
  const f = req.featureVector.features;

  if (f.emaAlignmentScore > 0.6) {
    confirmations.push('EMA_ALIGNMENT_OK');
  } else {
    confirmations.push('EMA_ALIGNMENT_MISSING');
  }

  if (f.timeConfluenceScore > 0.5) {
    confirmations.push('TIME_CONFLUENCE_OK');
  } else {
    confirmations.push('TIME_CONFLUENCE_WEAK');
  }

  if (f.crossMarketScore > 0.5) {
    confirmations.push('CROSS_MARKET_OK');
  } else {
    confirmations.push('CROSS_MARKET_WEAK');
  }

  return confirmations;
}

/** ── Boosts: positive evidence modifiers ────────────────────── */

function computeBoosts(req: DoctrineEvalRequest): Modifier[] {
  const boosts: Modifier[] = [];
  const f = req.featureVector.features;

  if (f.relativeVolumeScore > 0.8) {
    boosts.push({ code: 'BOOST:HIGH_PARTICIPATION', value: 0.05 });
  }
  if (f.timeConfluenceScore > 0.75) {
    boosts.push({ code: 'BOOST:SESSION_SWEET_SPOT', value: 0.03 });
  }
  if (f.crossMarketScore > 0.8) {
    boosts.push({ code: 'BOOST:CROSS_MARKET_CONFIRM', value: 0.04 });
  }
  if (f.liquidityScore > 0.85) {
    boosts.push({ code: 'BOOST:HIGH_LIQUIDITY', value: 0.02 });
  }
  if (f.optionsFlowScore != null && f.optionsFlowScore > 0.75) {
    boosts.push({ code: 'BOOST:OPTIONS_FLOW_ALIGNED', value: 0.04 });
  }

  return boosts;
}

/** ── Penalties: negative evidence modifiers ─────────────────── */

function computePenalties(req: DoctrineEvalRequest): Modifier[] {
  const penalties: Modifier[] = [];
  const f = req.featureVector.features;
  const r = req.regimeDecision;

  if (f.extensionScore > 0.8) {
    penalties.push({ code: 'PENALTY:OVER_EXTENDED', value: -0.06 });
  }
  if (r.transitionRisk > 0.6) {
    penalties.push({ code: 'PENALTY:TRANSITION_RISK', value: -0.05 });
  }
  if (f.eventRiskScore < 0.4 && f.eventRiskScore >= 0.15) {
    penalties.push({ code: 'PENALTY:EVENT_PROXIMITY', value: -0.04 });
  }
  if (f.liquidityScore < 0.3) {
    penalties.push({ code: 'PENALTY:LOW_LIQUIDITY', value: -0.03 });
  }
  if (f.momentumScore < 0.25) {
    penalties.push({ code: 'PENALTY:WEAK_MOMENTUM', value: -0.03 });
  }

  return penalties;
}

/** ── Main Evaluation ───────────────────────────────────────── */

export function evaluateDoctrine(req: DoctrineEvalRequest): DoctrineEvaluation {
  const hardBlocks = checkHardBlocks(req);
  const requiredConfirmations = checkConfirmations(req);
  const boosts = computeBoosts(req);
  const penalties = computePenalties(req);

  const doctrineNotes: string[] = [];
  if (hardBlocks.length > 0) {
    doctrineNotes.push(`Blocked by ${hardBlocks.length} hard rule(s)`);
  }
  const missingConfirms = requiredConfirmations.filter(c => c.endsWith('_MISSING') || c.endsWith('_WEAK'));
  if (missingConfirms.length > 0) {
    doctrineNotes.push(`Missing confirmations: ${missingConfirms.join(', ')}`);
  }

  return {
    hardBlocks,
    requiredConfirmations,
    boosts,
    penalties,
    doctrineNotes,
  };
}
