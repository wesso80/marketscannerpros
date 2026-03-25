/**
 * Correlation Dedup — Post-Fusion Correlation Clustering
 * @internal — NEVER import into user-facing components.
 *
 * After fusion scoring, clusters correlated symbols and keeps only the
 * highest-scoring member from each correlation group. This prevents
 * alerting on 5 correlated tech stocks simultaneously.
 *
 * Uses price-based grouping (sector/asset similarity) since we don't
 * have a full correlation matrix from CachedScanData.
 */

import type { FusionScore } from './types';

// ─── Known Correlation Groups ───────────────────────────────────────────────
// Hard-coded sector/theme clusters. In production, a rolling correlation
// matrix would replace this, but for now these capture the obvious overlaps.

const CORRELATION_GROUPS: Record<string, string[]> = {
  mega_tech:   ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  semis:       ['NVDA', 'AMD', 'INTC', 'QCOM', 'MU', 'AMAT', 'AVGO'],
  fintech:     ['SQ', 'PYPL', 'SHOP'],
  banks:       ['JPM', 'BAC', 'WFC', 'GS', 'MS'],
  cards:       ['V', 'MA'],
  pharma:      ['JNJ', 'PFE', 'ABBV', 'MRK', 'LLY'],
  energy:      ['XOM', 'CVX', 'COP', 'SLB'],
  consumer:    ['WMT', 'COST', 'PG', 'KO', 'PEP', 'MCD'],
  industrial:  ['CAT', 'DE', 'UPS', 'BA', 'HON', 'GE'],
  cloud_saas:  ['CRM', 'ORCL', 'SNOW', 'NOW', 'ADBE', 'INTU'],
  // Crypto clusters
  l1_major:    ['BTC', 'ETH'],
  l1_alt:      ['SOL', 'AVAX', 'NEAR', 'APT', 'SUI', 'SEI'],
  defi:        ['UNI', 'AAVE', 'PENDLE', 'INJ'],
  l2:          ['MATIC', 'ARB', 'OP', 'STX'],
  meme:        ['DOGE', 'SHIB'],
};

// Build reverse lookup: symbol → group name
const symbolToGroup = new Map<string, string>();
for (const [group, symbols] of Object.entries(CORRELATION_GROUPS)) {
  for (const s of symbols) {
    symbolToGroup.set(s, group);
  }
}

// ─── Dedup Logic ────────────────────────────────────────────────────────────

export interface DedupResult {
  kept: FusionScore[];
  removed: Array<{ symbol: string; reason: string; composite: number }>;
}

/**
 * Deduplicate correlated symbols from fusion results.
 * For each correlation group, keeps only the top-scoring member.
 *
 * @param scores - Fusion scores sorted by composite (descending)
 * @param maxPerGroup - Max symbols to keep per correlation group (default 1)
 */
export function deduplicateCorrelated(
  scores: FusionScore[],
  maxPerGroup = 1,
): DedupResult {
  const groupCounts = new Map<string, number>();
  const kept: FusionScore[] = [];
  const removed: DedupResult['removed'] = [];

  // Scores should already be sorted by composite desc
  for (const score of scores) {
    const group = symbolToGroup.get(score.symbol);

    if (!group) {
      // Not in any correlation group — always keep
      kept.push(score);
      continue;
    }

    const count = groupCounts.get(group) ?? 0;
    if (count < maxPerGroup) {
      kept.push(score);
      groupCounts.set(group, count + 1);
    } else {
      removed.push({
        symbol: score.symbol,
        reason: `Correlated with higher-scoring member in '${group}' group`,
        composite: score.composite,
      });
    }
  }

  return { kept, removed };
}
