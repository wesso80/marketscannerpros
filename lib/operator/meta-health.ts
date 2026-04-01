/**
 * MSP Operator — Meta-Health Engine §13.7
 * Monitors system-level health across rolling windows:
 *   - confidence inflation (are we scoring too high?)
 *   - deteriorating expectancy
 *   - over-permissioning (too many ALLOWs?)
 *   - playbook drift (are outcomes matching playbooks?)
 *   - slippage deterioration
 * Can throttle the engine globally when health degrades.
 * @internal
 */

import type { MetaHealthState, Verdict, TradeReview } from '@/types/operator';
import { clamp, nowISO } from './shared';

export interface MetaHealthInput {
  /** Recent verdicts (last N scans) */
  recentVerdicts: Pick<Verdict, 'confidenceScore' | 'permission' | 'playbook'>[];
  /** Recent trade reviews (closed trades) */
  recentReviews: Pick<TradeReview, 'outcomeClass' | 'mae' | 'mfe'>[];
  /** Average slippage observed (basis points) */
  avgSlippageBps: number;
  /** Baseline expected slippage (bps) */
  baselineSlippageBps: number;
}

/* ── Dimension computations ─────────────────────────────────── */

/**
 * Confidence inflation: if average confidence is too high, the model may
 * be over-fitting or thresholds drifted. Ideal avg confidence ~0.55-0.70.
 */
function computeConfidenceInflation(verdicts: MetaHealthInput['recentVerdicts']): number {
  if (verdicts.length === 0) return 0;
  const avg = verdicts.reduce((s, v) => s + v.confidenceScore, 0) / verdicts.length;
  // If avg > 0.80, inflation is severe. If < 0.60, no inflation.
  return clamp((avg - 0.60) / 0.25, 0, 1);
}

/**
 * Expectancy trend: are recent trades profitable?
 * Uses MFE-MAE ratio as proxy.
 */
function computeExpectancyTrend(reviews: MetaHealthInput['recentReviews']): number {
  if (reviews.length === 0) return 0.5; // neutral
  const totalNet = reviews.reduce((s, r) => s + (r.mfe - r.mae), 0);
  const avg = totalNet / reviews.length;
  // Positive = healthy, negative = deteriorating
  // Map roughly: -0.05 → 0, +0.05 → 1
  return clamp((avg + 0.05) / 0.10, 0, 1);
}

/**
 * Over-permission rate: what fraction of verdicts got ALLOW?
 * Healthy rate should be 20-40%. Above 60% is suspicious.
 */
function computeOverPermissionRate(verdicts: MetaHealthInput['recentVerdicts']): number {
  if (verdicts.length === 0) return 0;
  const allows = verdicts.filter(v => v.permission === 'ALLOW').length;
  const rate = allows / verdicts.length;
  // Over 50% = concerning, over 70% = severe
  return clamp((rate - 0.30) / 0.40, 0, 1);
}

/**
 * Playbook drift: are outcomes clustered in bad outcome classes?
 * High drift = many REGIME_MISMATCH, PLAYBOOK_DRIFT outcomes.
 */
function computePlaybookDrift(reviews: MetaHealthInput['recentReviews']): number {
  if (reviews.length === 0) return 0;
  const driftOutcomes = new Set([
    'REGIME_MISMATCH', 'PLAYBOOK_DRIFT', 'RIGHT_TIMING_BAD_STRUCTURE',
  ]);
  const drifts = reviews.filter(r => driftOutcomes.has(r.outcomeClass)).length;
  return clamp(drifts / reviews.length, 0, 1);
}

/**
 * Slippage deterioration: how much worse is observed vs baseline?
 */
function computeSlippageDeterioration(
  avgSlippageBps: number,
  baselineSlippageBps: number,
): number {
  if (baselineSlippageBps <= 0) return 0;
  const ratio = avgSlippageBps / baselineSlippageBps;
  // 1.0 = normal. 2.0 = double. 3.0+ = severe.
  return clamp((ratio - 1) / 2, 0, 1);
}

/* ── Composite ──────────────────────────────────────────────── */

const HEALTH_WEIGHTS = {
  confidenceInflation: 0.20,
  expectancy: 0.25,
  overPermission: 0.20,
  playbookDrift: 0.20,
  slippage: 0.15,
};

export function computeMetaHealth(input: MetaHealthInput): MetaHealthState {
  const confidenceInflation = computeConfidenceInflation(input.recentVerdicts);
  const expectancyTrend = computeExpectancyTrend(input.recentReviews);
  const overPermissionRate = computeOverPermissionRate(input.recentVerdicts);
  const playbookDrift = computePlaybookDrift(input.recentReviews);
  const slippageDeterioration = computeSlippageDeterioration(
    input.avgSlippageBps,
    input.baselineSlippageBps,
  );

  // Composite health: invert the bad dimensions, keep expectancy as-is
  const compositeHealth = clamp(
    1 - (
      HEALTH_WEIGHTS.confidenceInflation * confidenceInflation +
      HEALTH_WEIGHTS.expectancy * (1 - expectancyTrend) +
      HEALTH_WEIGHTS.overPermission * overPermissionRate +
      HEALTH_WEIGHTS.playbookDrift * playbookDrift +
      HEALTH_WEIGHTS.slippage * slippageDeterioration
    ),
    0, 1,
  );

  // Throttle multiplier: 1.0 = no throttle, 0.0 = full stop
  let throttleMultiplier = 1.0;
  if (compositeHealth < 0.50) throttleMultiplier = 0.5;
  if (compositeHealth < 0.30) throttleMultiplier = 0.0;

  const alerts: string[] = [];
  if (confidenceInflation > 0.7) alerts.push('META:CONFIDENCE_INFLATION_HIGH');
  if (expectancyTrend < 0.3) alerts.push('META:EXPECTANCY_DETERIORATING');
  if (overPermissionRate > 0.6) alerts.push('META:OVER_PERMISSIONING');
  if (playbookDrift > 0.5) alerts.push('META:PLAYBOOK_DRIFT_DETECTED');
  if (slippageDeterioration > 0.5) alerts.push('META:SLIPPAGE_ELEVATED');
  if (compositeHealth < 0.30) alerts.push('META:ENGINE_THROTTLED');

  return {
    timestamp: nowISO(),
    windowSize: input.recentVerdicts.length + input.recentReviews.length,
    confidenceInflation,
    expectancyTrend,
    overPermissionRate,
    playbookDrift,
    slippageDeterioration,
    compositeHealth,
    throttleMultiplier,
    alerts,
  };
}
