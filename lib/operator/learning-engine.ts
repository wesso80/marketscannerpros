/**
 * MSP Operator — Learning Engine
 * Bounded adaptive weight updates from §5.3:
 *   maxDelta = 0.03 per adjustment cycle
 *   minSample = 30 trades before adjustment
 * @internal
 */

import type {
  LearningWindowRequest, LearningWindowResult, ProposedAdjustment,
  ApplyAdjustmentsRequest,
} from '@/types/operator';
import {
  DEFAULT_SCORING_WEIGHTS, MAX_WEIGHT_DELTA, MIN_LEARNING_SAMPLE, clamp,
} from './shared';
import { q } from '@/lib/db';

/* ── Edge & Drift Metrics ───────────────────────────────────── */

interface TradeMetric {
  winRate: number;
  expectancyR: number;
  avgMaeR: number;
  avgMfeR: number;
}

function computeEdgeScore(m: TradeMetric): number {
  // Edge = expectancy-weighted by win-rate consistency
  if (m.expectancyR <= 0) return 0;
  return clamp(m.winRate * m.expectancyR * 5, 0, 1);
}

function computeDriftScore(m: TradeMetric): number {
  // Drift = how much MFE we're leaving on the table
  if (m.avgMfeR === 0) return 0;
  const captureRatio = m.expectancyR / m.avgMfeR;
  return clamp(1 - captureRatio, 0, 1);
}

/* ── Weight Adjustment Logic ────────────────────────────────── */

function proposeWeightAdjustments(
  metrics: TradeMetric,
  sampleSize: number,
): ProposedAdjustment[] {
  if (sampleSize < MIN_LEARNING_SAMPLE) return [];

  const adjustments: ProposedAdjustment[] = [];
  const weights = { ...DEFAULT_SCORING_WEIGHTS };

  // If win rate is high but expectancy is low → exits need improvement, not weights
  // If win rate is low but MFE is good → entry timing / structure scoring needs up-weight

  if (metrics.winRate < 0.4 && metrics.avgMfeR > 0.5) {
    // Good moves, bad entries → up-weight structureQuality
    const current = weights.structureQuality;
    const proposed = Math.min(current + MAX_WEIGHT_DELTA, 0.30);
    if (proposed !== current) {
      adjustments.push({
        type: 'WEIGHT_ADJUST',
        target: 'structureQuality',
        currentValue: current,
        proposedValue: proposed,
        delta: proposed - current,
        reason: 'Low win rate with good MFE suggests structure filtering needs improvement',
      });
    }
  }

  if (metrics.avgMaeR > 1.5) {
    // Large adverse excursions → up-weight extensionSafety
    const current = weights.extensionSafety;
    const proposed = Math.min(current + MAX_WEIGHT_DELTA, 0.20);
    if (proposed !== current) {
      adjustments.push({
        type: 'WEIGHT_ADJUST',
        target: 'extensionSafety',
        currentValue: current,
        proposedValue: proposed,
        delta: proposed - current,
        reason: 'High MAE suggests extension/overreach detection needs more weight',
      });
    }
  }

  if (metrics.winRate > 0.6 && metrics.expectancyR > 0.5) {
    // System is working well → consider loosening time confluence
    const current = weights.timeConfluence;
    if (current > 0.08) {
      const proposed = Math.max(current - MAX_WEIGHT_DELTA, 0.05);
      adjustments.push({
        type: 'WEIGHT_ADJUST',
        target: 'timeConfluence',
        currentValue: current,
        proposedValue: proposed,
        delta: proposed - current,
        reason: 'Strong performance may allow relaxing time confluence requirement',
      });
    }
  }

  // Ensure all adjustments respect MAX_WEIGHT_DELTA bound
  return adjustments.filter(a => Math.abs(a.delta) <= MAX_WEIGHT_DELTA);
}

/* ── Main Learning Window ───────────────────────────────────── */

export function analyzeLearningWindow(
  _req: LearningWindowRequest,
  tradeMetrics: TradeMetric,
  sampleSize: number,
): LearningWindowResult {
  const edgeScore = computeEdgeScore(tradeMetrics);
  const driftScore = computeDriftScore(tradeMetrics);
  const adjustments = proposeWeightAdjustments(tradeMetrics, sampleSize);

  return {
    sampleSize,
    metrics: {
      winRate: tradeMetrics.winRate,
      expectancyR: tradeMetrics.expectancyR,
      avgMaeR: tradeMetrics.avgMaeR,
      avgMfeR: tradeMetrics.avgMfeR,
      edgeScore,
      driftScore,
    },
    proposedAdjustments: adjustments,
  };
}

/* ── Apply Adjustments (bounded) ────────────────────────────── */

export function applyAdjustments(
  req: ApplyAdjustmentsRequest,
  currentWeights: Record<string, number>,
): Record<string, number> {
  const newWeights = { ...currentWeights };

  for (const adj of req.adjustments) {
    if (Math.abs(adj.delta) > MAX_WEIGHT_DELTA) {
      continue; // Safety: skip over-sized adjustments
    }
    if (adj.target in newWeights) {
      newWeights[adj.target] = clamp(
        newWeights[adj.target] + adj.delta,
        0, 1,
      );
    }
  }

  // Re-normalize so weights sum to ~1.0
  const sum = Object.values(newWeights).reduce((s, v) => s + v, 0);
  if (sum > 0) {
    for (const key of Object.keys(newWeights)) {
      newWeights[key] = newWeights[key] / sum;
    }
  }

  return newWeights;
}

/* ── DB Persistence ─────────────────────────────────────────── */

/**
 * Load the most recent persisted weights from `operator_weights`.
 * Falls back to DEFAULT_SCORING_WEIGHTS if no rows exist.
 */
export async function loadActiveWeights(): Promise<Record<string, number>> {
  try {
    const rows = await q(
      'SELECT weights FROM operator_weights ORDER BY applied_at DESC LIMIT 1',
    );
    if (rows.length > 0 && rows[0].weights) {
      return rows[0].weights as Record<string, number>;
    }
  } catch (err) {
    console.error('[learning-engine] Failed to load weights from DB, using defaults:', err);
  }
  return { ...DEFAULT_SCORING_WEIGHTS };
}

/**
 * Persist adjusted weights to `operator_weights` (append-only log).
 */
export async function saveWeights(
  newWeights: Record<string, number>,
  previousWeights: Record<string, number>,
  adjustments: unknown[],
  mode: string,
  appliedBy: string,
): Promise<void> {
  await q(
    `INSERT INTO operator_weights (weights, previous_weights, adjustments, mode, applied_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      JSON.stringify(newWeights),
      JSON.stringify(previousWeights),
      JSON.stringify(adjustments),
      mode,
      appliedBy,
    ],
  );
}
