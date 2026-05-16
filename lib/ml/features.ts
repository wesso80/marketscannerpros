/**
 * lib/ml/features.ts — Feature extraction from edge_ledger_setups.
 *
 * Pulls numeric/categorical fields off a setup row and emits a fixed-length
 * numeric feature vector. Used for:
 *   - training the simple win-rate scorer (lib/ml/scorer.ts)
 *   - feeding the analogue search embedding (lib/analogues/featureEmbedding.ts)
 *
 * Deterministic: same input → same output. No external API calls.
 */

export interface SetupFeatureInput {
  setupType: string;          // 'breakout' | 'reversal' | ...
  direction: string;          // 'long' | 'short'
  playbook: string | null;
  regime: string | null;
  vixLevel: number | null;
  ivPercentile: number | null;
  catalystProximityDays: number | null;
  evidenceQuality: number | null;
  opportunityScore: number | null;
  confidence: string | null;
  rewardRisk: number | null;
}

export interface FeatureVector {
  /** Stable feature order — DO NOT REORDER. Add new features at the end only. */
  names: string[];
  values: number[];
}

const SETUP_TYPES = ['breakout', 'reversal', 'continuation', 'fade', 'mean-revert', 'event-driven'];
const REGIMES = ['trend-up', 'trend-down', 'chop', 'vol-expand', 'vol-contract', 'risk-off'];
const CONFIDENCE = ['high', 'medium', 'low'];

function oneHot(value: string | null, classes: string[], prefix: string): { names: string[]; values: number[] } {
  return {
    names: classes.map((c) => `${prefix}_${c}`),
    values: classes.map((c) => (value === c ? 1 : 0)),
  };
}

function num(v: number | null, fallback = 0): number {
  return v === null || !Number.isFinite(v) ? fallback : v;
}

export function extractFeatures(input: SetupFeatureInput): FeatureVector {
  const names: string[] = [];
  const values: number[] = [];

  // Categorical one-hots
  const st = oneHot(input.setupType, SETUP_TYPES, 'setupType');
  names.push(...st.names); values.push(...st.values);

  names.push('direction_long');
  values.push(input.direction === 'long' ? 1 : 0);

  const rg = oneHot(input.regime, REGIMES, 'regime');
  names.push(...rg.names); values.push(...rg.values);

  const cf = oneHot(input.confidence, CONFIDENCE, 'confidence');
  names.push(...cf.names); values.push(...cf.values);

  // Continuous features — normalised to roughly [-1, 1] / [0, 1] ranges.
  names.push('vix_level_norm');         values.push(num(input.vixLevel) / 40);          // 0 at 0 VIX, 1 at 40
  names.push('iv_percentile_norm');     values.push(num(input.ivPercentile) / 100);
  names.push('catalyst_proximity_norm'); values.push(Math.min(num(input.catalystProximityDays, 30), 30) / 30);
  names.push('evidence_quality_norm');  values.push(num(input.evidenceQuality) / 100);
  names.push('opportunity_score_norm'); values.push(num(input.opportunityScore) / 100);
  names.push('reward_risk_capped');     values.push(Math.min(num(input.rewardRisk), 10) / 10);

  return { names, values };
}

export const FEATURE_DIM = (() => {
  const sample = extractFeatures({
    setupType: '', direction: '', playbook: null, regime: null,
    vixLevel: null, ivPercentile: null, catalystProximityDays: null,
    evidenceQuality: null, opportunityScore: null, confidence: null,
    rewardRisk: null,
  });
  return sample.names.length;
})();
