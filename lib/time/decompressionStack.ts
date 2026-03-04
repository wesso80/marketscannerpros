/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECOMPRESSION STACK — Multi-TF Aggregator with AOI Clustering
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Takes per-TF decompression results from decompressionEngine.ts and:
 *   1. Aggregates them into a single weighted stack score (0–100)
 *   2. Clusters mid50 levels that converge within a band → Areas of Interest
 *   3. Computes net pull bias and directional conviction
 *
 * AOI (Area of Interest):
 *   When 2+ TF midpoints sit within a configurable band (default 0.15%),
 *   they form a price magnet. Higher TF midpoints carry more weight.
 *
 * Usage:
 *   import { computeDecompressionStack } from '@/lib/time/decompressionStack';
 *   const stack = computeDecompressionStack(perTfResults, currentPrice);
 */

import type {
  DecompressionTFResult,
} from './decompressionEngine';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Maximum band width (%) for clustering mid50 levels into an AOI */
const DEFAULT_AOI_BAND_PCT = 0.15;

/** Minimum number of TFs to form a valid AOI cluster */
const MIN_AOI_TF_COUNT = 2;

// ─── Output Types ───────────────────────────────────────────────────────────

export interface AOICluster {
  /** Average price level of the cluster */
  avgLevel: number;
  /** Price band boundaries */
  bandLow: number;
  bandHigh: number;
  /** TF labels contributing to this cluster */
  tfs: string[];
  /** Sum of TF weights in the cluster */
  weightSum: number;
  /** Highest single TF weight in the cluster (indicates conviction) */
  maxWeight: number;
  /** Highest TF label in the cluster */
  highestTF: string;
  /** Net pull direction of this cluster relative to current price */
  pullDirection: 'up' | 'down' | 'at';
  /** Cluster quality score (0–100) based on count, weights, alignment */
  quality: number;
}

export interface DecompressionStackResult {
  // ── Aggregate Metrics ──
  /** Weighted stack score (0–100).
   *  Higher = more TFs in active decompression windows pointing in the same direction. */
  stackScore: number;
  stackRating: 'extreme' | 'high' | 'moderate' | 'low' | 'none';

  // ── Per-TF breakdown (passed through) ──
  levels: DecompressionTFResult[];

  // ── Active Window Summary ──
  activeWindowCount: number;
  totalTFCount: number;
  activeTFs: string[];

  // ── Direction ──
  netPullDirection: 'bullish' | 'bearish' | 'neutral';
  netPullBias: number;          // -100 to +100
  bullishPullWeight: number;
  bearishPullWeight: number;

  // ── AOI Clusters ──
  midpointClusters: AOICluster[];
  /** Strongest AOI cluster (by quality) */
  primaryAOI: AOICluster | null;
  /** Total number of TF midpoints participating in any AOI */
  clusteredTFCount: number;

  // ── Top-level metadata ──
  taggedCount: number;          // How many TFs have already tagged their 50%
  untaggedActiveCount: number;  // Active window + not tagged = high-potential
  reasoning: string;
}

// ─── Helper: cluster mid50 levels ───────────────────────────────────────────

function clusterMid50Levels(
  results: DecompressionTFResult[],
  currentPrice: number,
  bandPct: number = DEFAULT_AOI_BAND_PCT,
): AOICluster[] {
  // Only consider TFs with a meaningful mid50 (non-zero)
  const withLevels = results
    .filter(r => r.mid50Level > 0)
    .sort((a, b) => a.mid50Level - b.mid50Level);

  if (withLevels.length < MIN_AOI_TF_COUNT) return [];

  const clusters: AOICluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < withLevels.length; i++) {
    if (used.has(i)) continue;

    const seed = withLevels[i];
    const members = [seed];
    used.add(i);

    // Grow the cluster: add any TF whose mid50 is within bandPct of the seed
    const bandWidth = seed.mid50Level * (bandPct / 100);
    for (let j = i + 1; j < withLevels.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(withLevels[j].mid50Level - seed.mid50Level) <= bandWidth) {
        members.push(withLevels[j]);
        used.add(j);
      } else {
        break; // sorted — once we exceed band we can stop
      }
    }

    if (members.length < MIN_AOI_TF_COUNT) continue;

    const avgLevel = members.reduce((s, m) => s + m.mid50Level, 0) / members.length;
    const weightSum = members.reduce((s, m) => s + m.weight, 0);
    const maxWeight = Math.max(...members.map(m => m.weight));
    const highestTFEntry = members.reduce((best, m) => m.weight > best.weight ? m : best, members[0]);

    const pullDirection: AOICluster['pullDirection'] =
      avgLevel > currentPrice * 1.0001 ? 'up' :
      avgLevel < currentPrice * 0.9999 ? 'down' :
      'at';

    // Quality score: count × weight × alignment bonus
    const countScore = Math.min(40, members.length * 10); // Max 40 from count
    const weightScore = Math.min(35, weightSum * 3);       // Max 35 from weights
    const alignmentBonus = members.every(m => m.pullDirection === members[0].pullDirection) ? 25 : 10;
    const quality = Math.min(100, countScore + weightScore + alignmentBonus);

    clusters.push({
      avgLevel: Math.round(avgLevel * 100) / 100,
      bandLow: Math.round((avgLevel - bandWidth) * 100) / 100,
      bandHigh: Math.round((avgLevel + bandWidth) * 100) / 100,
      tfs: members.map(m => m.tfLabel),
      weightSum: Math.round(weightSum * 100) / 100,
      maxWeight,
      highestTF: highestTFEntry.tfLabel,
      pullDirection,
      quality: Math.round(quality),
    });
  }

  // Sort by quality descending
  clusters.sort((a, b) => b.quality - a.quality);
  return clusters;
}

// ─── Stack Computation ──────────────────────────────────────────────────────

/**
 * Aggregate all per-TF decompression results into a single stack assessment.
 *
 * @param levels  Per-TF results from decompressionEngine.computeAllDecompressionStates()
 * @param currentPrice  Current asset price (needed for AOI pull direction)
 * @param aoiBandPct  AOI band width in % (default 0.15)
 */
export function computeDecompressionStack(
  levels: DecompressionTFResult[],
  currentPrice: number,
  aoiBandPct: number = DEFAULT_AOI_BAND_PCT,
): DecompressionStackResult {
  if (levels.length === 0) {
    return emptyResult();
  }

  // ── Active windows ──
  const activeLevels = levels.filter(l => l.windowActive);
  const activeWindowCount = activeLevels.length;
  const activeTFs = activeLevels.map(l => l.tfLabel);

  // ── Tag stats ──
  const taggedCount = levels.filter(l => l.tagged).length;
  const untaggedActive = activeLevels.filter(l => !l.tagged);
  const untaggedActiveCount = untaggedActive.length;

  // ── Weighted stack score (0–100) ──
  // Each TF contributes: (score / 10) × weight, capped at weight
  // Normalize by sum of ALL weights to get 0–100 range
  const totalWeight = levels.reduce((s, l) => s + l.weight, 0);
  const weightedScoreSum = levels.reduce((s, l) => s + (l.score / 10) * l.weight, 0);
  const rawStackScore = totalWeight > 0 ? (weightedScoreSum / totalWeight) * 100 : 0;
  const stackScore = Math.round(Math.min(100, rawStackScore) * 10) / 10;

  const stackRating: DecompressionStackResult['stackRating'] =
    stackScore >= 80 ? 'extreme' :
    stackScore >= 60 ? 'high' :
    stackScore >= 35 ? 'moderate' :
    stackScore >= 15 ? 'low' :
    'none';

  // ── Pull bias ──
  let bullishPullWeight = 0;
  let bearishPullWeight = 0;

  for (const l of levels) {
    if (l.score <= 0) continue;
    const contribution = (l.score / 10) * l.weight;
    if (l.pullDirection === 'up')   bullishPullWeight += contribution;
    if (l.pullDirection === 'down') bearishPullWeight += contribution;
  }

  const totalPull = bullishPullWeight + bearishPullWeight;
  const netPullBias = totalPull > 0
    ? Math.round(((bullishPullWeight - bearishPullWeight) / totalPull) * 100)
    : 0;

  const netPullDirection: 'bullish' | 'bearish' | 'neutral' =
    netPullBias > 20 ? 'bullish' :
    netPullBias < -20 ? 'bearish' :
    'neutral';

  // ── AOI Clustering ──
  const midpointClusters = clusterMid50Levels(levels, currentPrice, aoiBandPct);
  const primaryAOI = midpointClusters.length > 0 ? midpointClusters[0] : null;
  const clusteredTFCount = midpointClusters.reduce(
    (sum, c) => sum + c.tfs.length, 0
  );

  // ── Reasoning ──
  const parts: string[] = [];
  if (untaggedActiveCount >= 3) {
    parts.push(`${untaggedActiveCount} TFs in active decompression windows (untagged)`);
  } else if (untaggedActiveCount > 0) {
    parts.push(`${untaggedActiveCount}/${activeWindowCount} active window(s) untagged`);
  } else if (activeWindowCount > 0) {
    parts.push(`${activeWindowCount} active windows, all tagged`);
  } else {
    parts.push('No active decompression windows');
  }
  if (primaryAOI) {
    parts.push(`AOI at ${primaryAOI.avgLevel.toFixed(2)} (${primaryAOI.tfs.join(', ')})`);
  }
  if (netPullBias !== 0) {
    parts.push(`Pull bias: ${netPullDirection} (${netPullBias > 0 ? '+' : ''}${netPullBias})`);
  }

  return {
    stackScore,
    stackRating,
    levels,
    activeWindowCount,
    totalTFCount: levels.length,
    activeTFs,
    netPullDirection,
    netPullBias,
    bullishPullWeight: Math.round(bullishPullWeight * 100) / 100,
    bearishPullWeight: Math.round(bearishPullWeight * 100) / 100,
    midpointClusters,
    primaryAOI,
    clusteredTFCount,
    taggedCount,
    untaggedActiveCount,
    reasoning: parts.join(' · '),
  };
}

// ─── Empty Result ───────────────────────────────────────────────────────────

function emptyResult(): DecompressionStackResult {
  return {
    stackScore: 0,
    stackRating: 'none',
    levels: [],
    activeWindowCount: 0,
    totalTFCount: 0,
    activeTFs: [],
    netPullDirection: 'neutral',
    netPullBias: 0,
    bullishPullWeight: 0,
    bearishPullWeight: 0,
    midpointClusters: [],
    primaryAOI: null,
    clusteredTFCount: 0,
    taggedCount: 0,
    untaggedActiveCount: 0,
    reasoning: 'No decompression data available',
  };
}
