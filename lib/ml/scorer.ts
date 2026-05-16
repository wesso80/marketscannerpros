/**
 * lib/ml/scorer.ts — Simple logistic-style win-rate scorer.
 *
 * Trains a linear model w·x + b → sigmoid by gradient descent on
 * resolved setups (joined with edge_ledger_outcomes). Outputs a
 * predicted probability that a fresh setup wins 5d (R > 0).
 *
 * Why not ship a heavy ML lib?
 *  - Logistic regression captures most of the signal in <120 setups.
 *  - Zero new deps, fully auditable.
 *  - Operator can read the weights and see WHY a setup scored high.
 *
 * Caveat: with N < 30 resolved setups the model is unreliable —
 * the trainResult exposes `n` so the UI can warn.
 */

import { q } from '@/lib/db';
import { extractFeatures, type FeatureVector, FEATURE_DIM } from './features';

export interface ModelWeights {
  weights: number[];       // length === FEATURE_DIM
  bias: number;
  featureNames: string[];
  trainedAt: string;
  n: number;               // training set size
  trainLogLoss: number;
  trainAcc: number;
}

interface TrainingExample {
  vector: FeatureVector;
  label: 0 | 1;            // 1 if realised_r_5d > 0
}

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function loadTrainingSet(workspaceId: string): Promise<TrainingExample[]> {
  const rows = await q<{
    setup_type: string; direction: string; playbook: string | null;
    regime: string | null;
    vix_level: string | null; iv_percentile: string | null;
    catalyst_proximity_days: number | null;
    evidence_quality: string | null; opportunity_score: string | null;
    confidence: string | null; reward_risk: string | null;
    realised_r_5d: string | null;
  }>(
    `SELECT s.setup_type, s.direction, s.playbook, s.regime,
            s.vix_level::text, s.iv_percentile::text, s.catalyst_proximity_days,
            s.evidence_quality::text, s.opportunity_score::text, s.confidence,
            s.reward_risk::text, o.realised_r_5d::text
       FROM edge_ledger_setups s
       JOIN edge_ledger_outcomes o ON o.setup_id = s.id
      WHERE s.workspace_id = $1
        AND o.outcome_status IN ('partial', 'complete')
        AND o.realised_r_5d IS NOT NULL`,
    [workspaceId],
  );

  return rows.map((r) => {
    const vector = extractFeatures({
      setupType: r.setup_type,
      direction: r.direction,
      playbook: r.playbook,
      regime: r.regime,
      vixLevel: r.vix_level === null ? null : Number(r.vix_level),
      ivPercentile: r.iv_percentile === null ? null : Number(r.iv_percentile),
      catalystProximityDays: r.catalyst_proximity_days,
      evidenceQuality: r.evidence_quality === null ? null : Number(r.evidence_quality),
      opportunityScore: r.opportunity_score === null ? null : Number(r.opportunity_score),
      confidence: r.confidence,
      rewardRisk: r.reward_risk === null ? null : Number(r.reward_risk),
    });
    const r5 = Number(r.realised_r_5d);
    const label: 0 | 1 = Number.isFinite(r5) && r5 > 0 ? 1 : 0;
    return { vector, label };
  });
}

export async function trainModel(workspaceId: string): Promise<ModelWeights> {
  const examples = await loadTrainingSet(workspaceId);
  const featureNames = examples[0]?.vector.names ?? Array.from({ length: FEATURE_DIM }, (_, i) => `f${i}`);

  const weights = new Array<number>(featureNames.length).fill(0);
  let bias = 0;

  if (examples.length === 0) {
    return { weights, bias, featureNames, trainedAt: new Date().toISOString(), n: 0, trainLogLoss: 0, trainAcc: 0 };
  }

  const lr = 0.05;
  const epochs = 400;
  const l2 = 0.001;
  const n = examples.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gW = new Array<number>(weights.length).fill(0);
    let gB = 0;
    for (const ex of examples) {
      const z = dot(weights, ex.vector.values) + bias;
      const p = sigmoid(z);
      const err = p - ex.label;
      for (let i = 0; i < weights.length; i++) gW[i] += err * ex.vector.values[i];
      gB += err;
    }
    for (let i = 0; i < weights.length; i++) {
      weights[i] -= (lr * (gW[i] / n + l2 * weights[i]));
    }
    bias -= (lr * gB) / n;
  }

  // Compute training metrics
  let logLoss = 0;
  let correct = 0;
  for (const ex of examples) {
    const z = dot(weights, ex.vector.values) + bias;
    const p = sigmoid(z);
    const eps = 1e-9;
    logLoss += -(ex.label * Math.log(p + eps) + (1 - ex.label) * Math.log(1 - p + eps));
    if ((p >= 0.5 ? 1 : 0) === ex.label) correct++;
  }
  logLoss /= n;
  const trainAcc = correct / n;

  return {
    weights, bias, featureNames,
    trainedAt: new Date().toISOString(),
    n, trainLogLoss: logLoss, trainAcc,
  };
}

export function scoreSetup(model: ModelWeights, vector: FeatureVector): number {
  if (model.n === 0) return 0.5;          // uninformed prior
  const z = dot(model.weights, vector.values) + model.bias;
  return sigmoid(z);
}

export function topWeightedFeatures(model: ModelWeights, k = 8): Array<{ name: string; weight: number }> {
  const indexed = model.featureNames.map((name, i) => ({ name, weight: model.weights[i] }));
  return indexed
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, k);
}
