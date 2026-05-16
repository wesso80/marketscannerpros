/**
 * lib/analogues/featureEmbedding.ts
 *
 * Build a fixed-size 32-dim numeric feature vector from an edge-ledger
 * setup row. No LLM embedding API — deterministic, cheap, reproducible.
 *
 * Dimensions are normalised to roughly [-1, 1] using sensible bounds so
 * cosine distance is meaningful across mixed-scale inputs. Missing
 * values become 0 (the neutral midpoint).
 *
 * Ordering of dimensions is part of the contract — do NOT reorder
 * without re-embedding all historical rows.
 */

export const EMBEDDING_DIM = 32;

export interface SetupFeatures {
  regime?: string | null;
  setupType?: string | null;
  direction?: string | null;
  market?: string | null;
  playbook?: string | null;
  sector?: string | null;
  vixLevel?: number | null;
  ivPercentile?: number | null;
  catalystProximityDays?: number | null;
  evidenceQuality?: number | null;
  opportunityScore?: number | null;
  confidence?: string | null;
  rewardRisk?: number | null;
}

// --- normalisers ---
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const scale = (x: number | null | undefined, lo: number, hi: number): number => {
  if (x === null || x === undefined || Number.isNaN(x)) return 0;
  // map [lo, hi] → [-1, 1]
  return clamp((2 * (x - lo)) / (hi - lo) - 1, -1, 1);
};
const oneHotEqual = (v: string | null | undefined, target: string): number =>
  (v ?? '').toLowerCase() === target.toLowerCase() ? 1 : 0;

const REGIMES = ['trend-up', 'trend-down', 'chop', 'vol-expand', 'vol-contract', 'risk-off'];
const SETUP_TYPES = ['breakout', 'reversal', 'continuation', 'fade', 'mean-revert', 'event-driven'];
const MARKETS = ['equity', 'crypto', 'options', 'futures'];

export function buildFeatureEmbedding(f: SetupFeatures): number[] {
  const v: number[] = [];

  // Regime one-hot (6 dims)
  for (const r of REGIMES) v.push(oneHotEqual(f.regime, r));

  // Setup type one-hot (6 dims)
  for (const s of SETUP_TYPES) v.push(oneHotEqual(f.setupType, s));

  // Market one-hot (4 dims)
  for (const m of MARKETS) v.push(oneHotEqual(f.market, m));

  // Direction (1 dim)
  v.push(f.direction === 'long' ? 1 : f.direction === 'short' ? -1 : 0);

  // Confidence (1 dim)
  v.push(f.confidence === 'high' ? 1 : f.confidence === 'medium' ? 0 : f.confidence === 'low' ? -1 : 0);

  // Numeric features (normalised) — 8 dims
  v.push(scale(f.vixLevel ?? null, 10, 50));               // VIX 10–50 → [-1,1]
  v.push(scale(f.ivPercentile ?? null, 0, 100));           // IV percentile
  v.push(scale(f.catalystProximityDays ?? null, 0, 30));   // 0–30 days
  v.push(scale(f.evidenceQuality ?? null, 0, 100));
  v.push(scale(f.opportunityScore ?? null, 0, 100));
  v.push(scale(f.rewardRisk ?? null, 0, 5));               // R:R up to 5
  v.push(0); // reserved (slot for future feature, keeps dim stable)
  v.push(0); // reserved

  // Sector hash bucket (4 dims) — cheap deterministic bucketing
  const sectorBuckets = sectorBucket(f.sector);
  v.push(...sectorBuckets);

  // Playbook hash bucket (2 dims)
  v.push(...stringBucket(f.playbook ?? null, 2));

  if (v.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding dim mismatch: got ${v.length}, expected ${EMBEDDING_DIM}`);
  }
  return v;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function sectorBucket(sector: string | null | undefined): number[] {
  if (!sector) return [0, 0, 0, 0];
  const h = hashStr(sector.toLowerCase());
  return [
    ((h & 0xff) / 255) * 2 - 1,
    (((h >> 8) & 0xff) / 255) * 2 - 1,
    (((h >> 16) & 0xff) / 255) * 2 - 1,
    (((h >> 24) & 0xff) / 255) * 2 - 1,
  ];
}

function stringBucket(s: string | null, dims: number): number[] {
  if (!s) return new Array(dims).fill(0);
  const h = hashStr(s.toLowerCase());
  const out: number[] = [];
  for (let i = 0; i < dims; i++) {
    out.push((((h >> (i * 8)) & 0xff) / 255) * 2 - 1);
  }
  return out;
}

/** Postgres vector literal: [0.1,0.2,...] */
export function vectorLiteral(v: number[]): string {
  return '[' + v.map((x) => Number.isFinite(x) ? x.toFixed(6) : '0').join(',') + ']';
}
