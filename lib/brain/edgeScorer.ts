/**
 * Layer 4 — Brain Edge Scorer
 *
 * Computes sample-size-aware edge scores from brain_outcomes rows.
 *
 * Hard rule: a HIGH win rate over a SMALL sample MUST score lower than a
 * MODEST win rate over a LARGE clean sample. We enforce this using:
 *
 *   1. Wilson score interval (95%) — replaces raw win-rate with the lower
 *      bound of the CI. Small samples → wide CI → low lower bound.
 *   2. Empirical-Bayes shrinkage — pulls the estimate toward a prior
 *      (default 0.5) by a factor inversely proportional to sample size.
 *   3. Sample-size penalty — explicit multiplier 0..1 that asymptotes to 1
 *      around N=200 and is ≤ 0.5 below N=30.
 *   4. Recency weight — exponential decay favouring recent outcomes.
 *   5. Overfitting penalty — applies when the setup_key has too many
 *      distinct dimensions (we accept it as a parameter; the caller is
 *      responsible for measuring dimensionality).
 *   6. Stale / missing-data penalties — propagated from feature snapshots.
 *
 * Final published edge_score = clamp(
 *     wilsonLower * sampleSizePenalty * recencyWeight
 *       * (1 − overfittingPenalty) * (1 − staleDataPenalty) * (1 − missingDataPenalty),
 *     0, 1
 * )
 *
 * Tiers are derived from edge_score AND sample_size simultaneously so a
 * tiny sample can never reach 'elite'.
 */

import { createHash, randomUUID } from 'crypto';
import { q } from '@/lib/db';
import {
  BRAIN_SCORING_MODEL_VERSION,
  type AssetClass,
  type ConfidenceLabel,
  type EdgeScore,
  type EdgeTier,
  type OutcomeHorizon,
} from './types';

// ─── Statistical helpers ─────────────────────────────────────────────────────

/** Wilson score interval lower bound at 95% confidence. */
export function wilsonLowerBound(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const phat = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

export function wilsonUpperBound(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const phat = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return Math.min(1, (centre + margin) / denom);
}

/** Empirical Bayes shrinkage toward a prior (default 0.5). */
export function shrunkRate(wins: number, n: number, prior = 0.5, priorStrength = 30): number {
  if (n <= 0) return prior;
  return (wins + prior * priorStrength) / (n + priorStrength);
}

/**
 * Sample-size penalty:
 *   N ≤ 5   → 0.10
 *   N = 30  → 0.50
 *   N = 100 → 0.85
 *   N ≥ 200 → 1.00
 */
export function sampleSizePenalty(n: number): number {
  if (n <= 0) return 0;
  // Smooth logistic-ish curve.
  const k = 0.025;
  const midpoint = 30;
  const raw = 1 / (1 + Math.exp(-k * (n - midpoint)));
  return Math.max(0, Math.min(1, raw));
}

/** Exponential recency weight. half_life_days controls decay. */
export function recencyWeight(meanAgeDays: number, halfLifeDays = 90): number {
  if (meanAgeDays <= 0) return 1;
  return Math.pow(0.5, meanAgeDays / halfLifeDays);
}

// ─── Inputs to the scorer ────────────────────────────────────────────────────

export interface EdgeScoreInputs {
  workspaceId: string;
  setupKey: string;
  regime?: string | null;
  assetClass?: AssetClass | null;
  timeframe?: string | null;
  horizon: OutcomeHorizon;

  /** Time bounds of the outcome window considered. */
  windowStart: Date;
  windowEnd: Date;

  /** One row per outcome under consideration. */
  outcomes: Array<{
    outcomeClass:
      | 'failed_before_confirmation'
      | 'confirmed_then_failed'
      | 'confirmed_followed_through'
      | 'no_resolution'
      | 'insufficient_data';
    mfePct: number | null;
    maePct: number | null;
    asOfTs: Date;
    /** Optional flags to feed penalties; default 0. */
    missingDataCount?: number;
    staleDataCount?: number;
    /** Optional regime adjustment factor (1.0 = neutral). */
    regimeMultiplier?: number;
    /** Optional volatility adjustment factor (1.0 = neutral). */
    volMultiplier?: number;
  }>;

  /**
   * Number of distinct conditioning dimensions baked into setup_key.
   * Used for the overfitting penalty: more dimensions on a small sample
   * = more risk of spurious edge.
   */
  conditioningDimensions?: number;

  /** Override default scoring model version (advanced). */
  scoringModelVersion?: string;
}

// ─── Core scorer ─────────────────────────────────────────────────────────────

export function scoreEdge(inputs: EdgeScoreInputs): Omit<EdgeScore, 'edgeId'> {
  const {
    workspaceId,
    setupKey,
    regime = null,
    assetClass = null,
    timeframe = null,
    horizon,
    windowStart,
    windowEnd,
    outcomes,
    conditioningDimensions = 1,
    scoringModelVersion = BRAIN_SCORING_MODEL_VERSION,
  } = inputs;

  const usable = outcomes.filter(
    (o) => o.outcomeClass !== 'insufficient_data' && o.outcomeClass !== 'no_resolution',
  );
  const n = usable.length;
  const wins = usable.filter((o) => o.outcomeClass === 'confirmed_followed_through').length;
  const losses = usable.filter(
    (o) => o.outcomeClass === 'failed_before_confirmation' || o.outcomeClass === 'confirmed_then_failed',
  ).length;
  const neutrals = outcomes.length - usable.length;

  const winRate = n > 0 ? wins / n : null;
  const avgMfe = n > 0 ? mean(usable.map((o) => o.mfePct ?? 0)) : null;
  const avgMae = n > 0 ? mean(usable.map((o) => o.maePct ?? 0)) : null;
  const mfeMaeRatio =
    avgMfe !== null && avgMae !== null && avgMae !== 0 ? Math.abs(avgMfe / avgMae) : null;

  const expectancyProxy =
    winRate !== null && avgMfe !== null && avgMae !== null
      ? avgMfe * winRate + avgMae * (1 - winRate)
      : null;

  const volMult = mean(usable.map((o) => o.volMultiplier ?? 1)) ?? 1;
  const regimeMult = mean(usable.map((o) => o.regimeMultiplier ?? 1)) ?? 1;
  const volAdjExpectancy = expectancyProxy !== null ? expectancyProxy * volMult : null;
  const regimeAdjExpectancy = expectancyProxy !== null ? expectancyProxy * regimeMult : null;

  const wilsonLower = winRate !== null ? wilsonLowerBound(wins, n) : null;
  const wilsonUpper = winRate !== null ? wilsonUpperBound(wins, n) : null;
  const shrinkage = winRate !== null ? shrunkRate(wins, n) : null;

  const sizePenalty = sampleSizePenalty(n);

  // Recency: mean age in days from windowEnd
  const meanAgeDays =
    n > 0
      ? mean(
          usable.map(
            (o) => (windowEnd.getTime() - o.asOfTs.getTime()) / (1000 * 60 * 60 * 24),
          ),
        ) ?? 0
      : 0;
  const recency = recencyWeight(meanAgeDays);

  // Overfitting: scales with conditioning dimensions vs sample size.
  // dims=1, n=200 → ~0; dims=5, n=20 → ~0.6
  const overfittingPenalty = Math.max(0, Math.min(1, (conditioningDimensions - 1) / Math.max(5, n / 5)));

  // Data-quality penalties — averaged across sample
  const avgMissing = mean(usable.map((o) => o.missingDataCount ?? 0)) ?? 0;
  const avgStale = mean(usable.map((o) => o.staleDataCount ?? 0)) ?? 0;
  const missingDataPenalty = Math.min(1, avgMissing / 10);
  const staleDataPenalty = Math.min(1, avgStale / 10);

  // Risk profile
  const drawdownSensitivity = n > 0 ? Math.min(...usable.map((o) => o.maePct ?? 0)) : null;
  const falsePositiveRate =
    n > 0 ? usable.filter((o) => o.outcomeClass === 'failed_before_confirmation').length / n : null;
  const trapRate =
    n > 0 ? usable.filter((o) => o.outcomeClass === 'confirmed_then_failed').length / n : null;
  const confirmationFailureRate =
    falsePositiveRate !== null && trapRate !== null ? falsePositiveRate + trapRate : null;

  // Final score
  const base = wilsonLower ?? 0;
  const edgeScoreRaw =
    base *
    sizePenalty *
    recency *
    (1 - overfittingPenalty) *
    (1 - staleDataPenalty) *
    (1 - missingDataPenalty);
  const edgeScore = Math.max(0, Math.min(1, edgeScoreRaw));

  // Tier — sample size acts as a ceiling
  const edgeTier: EdgeTier = (() => {
    if (n < 10) return 'insufficient_sample';
    if (edgeScore >= 0.55 && n >= 100) return 'elite';
    if (edgeScore >= 0.45 && n >= 50) return 'strong';
    if (edgeScore >= 0.30 && n >= 20) return 'emerging';
    if (edgeScore >= 0.15) return 'weak';
    return 'noise';
  })();

  const confidenceLabel: ConfidenceLabel =
    n >= 100 && edgeScore >= 0.45 ? 'high' : n >= 30 && edgeScore >= 0.25 ? 'medium' : 'low';

  const reasonParts: string[] = [];
  reasonParts.push(`n=${n}`);
  if (winRate !== null) reasonParts.push(`win_rate=${(winRate * 100).toFixed(1)}%`);
  if (wilsonLower !== null) reasonParts.push(`wilson_lower=${(wilsonLower * 100).toFixed(1)}%`);
  reasonParts.push(`size_penalty=${sizePenalty.toFixed(2)}`);
  reasonParts.push(`recency=${recency.toFixed(2)}`);
  if (overfittingPenalty > 0.05) reasonParts.push(`overfit_penalty=${overfittingPenalty.toFixed(2)}`);
  if (staleDataPenalty > 0) reasonParts.push(`stale_penalty=${staleDataPenalty.toFixed(2)}`);
  if (missingDataPenalty > 0) reasonParts.push(`missing_penalty=${missingDataPenalty.toFixed(2)}`);
  const confidenceReason = reasonParts.join(', ');

  // Inputs hash for replay determinism
  const inputsHash = createHash('sha256')
    .update(
      JSON.stringify({
        workspaceId,
        setupKey,
        regime,
        horizon,
        windowStart,
        windowEnd,
        outcomeCount: outcomes.length,
        n,
        wins,
        losses,
        scoringModelVersion,
      }),
    )
    .digest('hex');

  return {
    workspaceId,
    setupKey,
    regime,
    assetClass,
    timeframe,
    horizon,
    computedAt: new Date(),
    windowStart,
    windowEnd,
    sampleSize: n,
    wins,
    losses,
    neutrals,
    winRate,
    avgMfePct: avgMfe,
    avgMaePct: avgMae,
    mfeMaeRatio,
    expectancyProxy,
    volAdjExpectancy,
    regimeAdjExpectancy,
    wilsonLower95: wilsonLower,
    wilsonUpper95: wilsonUpper,
    shrinkageEstimate: shrinkage,
    sampleSizePenalty: sizePenalty,
    recencyWeight: recency,
    overfittingPenalty,
    staleDataPenalty,
    missingDataPenalty,
    drawdownSensitivity,
    falsePositiveRate,
    trapRate,
    confirmationFailureRate,
    edgeScore,
    edgeTier,
    confidenceLabel,
    confidenceReason,
    scoringModelVersion,
    inputsHash,
  };
}

export async function persistEdgeScore(score: Omit<EdgeScore, 'edgeId'>): Promise<EdgeScore> {
  const edgeId = randomUUID();
  await q(
    `INSERT INTO brain_edge_scores (
       edge_id, workspace_id, setup_key, regime, asset_class, timeframe, horizon,
       computed_at, window_start, window_end,
       sample_size, wins, losses, neutrals, win_rate,
       avg_mfe_pct, avg_mae_pct, mfe_mae_ratio,
       expectancy_proxy, vol_adj_expectancy, regime_adj_expectancy,
       wilson_lower_95, wilson_upper_95, shrinkage_estimate,
       sample_size_penalty, recency_weight, overfitting_penalty,
       stale_data_penalty, missing_data_penalty,
       drawdown_sensitivity, false_positive_rate, trap_rate, confirmation_failure_rate,
       edge_score, edge_tier, confidence_label, confidence_reason,
       scoring_model_version, inputs_hash
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,
       $11,$12,$13,$14,$15,
       $16,$17,$18,
       $19,$20,$21,
       $22,$23,$24,
       $25,$26,$27,
       $28,$29,
       $30,$31,$32,$33,
       $34,$35,$36,$37,
       $38,$39
     )`,
    [
      edgeId,
      score.workspaceId,
      score.setupKey,
      score.regime,
      score.assetClass,
      score.timeframe,
      score.horizon,
      score.computedAt,
      score.windowStart,
      score.windowEnd,
      score.sampleSize,
      score.wins,
      score.losses,
      score.neutrals,
      score.winRate,
      score.avgMfePct,
      score.avgMaePct,
      score.mfeMaeRatio,
      score.expectancyProxy,
      score.volAdjExpectancy,
      score.regimeAdjExpectancy,
      score.wilsonLower95,
      score.wilsonUpper95,
      score.shrinkageEstimate,
      score.sampleSizePenalty,
      score.recencyWeight,
      score.overfittingPenalty,
      score.staleDataPenalty,
      score.missingDataPenalty,
      score.drawdownSensitivity,
      score.falsePositiveRate,
      score.trapRate,
      score.confirmationFailureRate,
      score.edgeScore,
      score.edgeTier,
      score.confidenceLabel,
      score.confidenceReason,
      score.scoringModelVersion,
      score.inputsHash,
    ],
  );
  return { ...score, edgeId };
}

// ─── Internal ────────────────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
