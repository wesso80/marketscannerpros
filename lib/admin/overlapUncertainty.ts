/** Intercept-only CR1 variance: G/(G-1) * sum(cluster residual total squared) / N^2.
 * Maintains a signal-weighted mean, allowing arbitrary dependence inside fixed UTC blocks.
 * Between-block independence remains an assumption; this is sensitivity analysis, not validation.
 */
export const MIN_UNCERTAINTY_BLOCKS = 30;
const DAY_MS = 86400000;
export interface OverlapInterval {
  blockDays: 1 | 7;
  blocks: number;
  signals: number;
  excluded: number;
  largestBlock: number;
  mean: number | null;
  low: number | null;
  high: number | null;
  status: 'insufficient_blocks' | 'available';
}
export function clusteredMean(rows: {signalAt: string | Date; signedMove: number}[], cost: number, blockDays: 1 | 7): OverlapInterval {
  const blocks = new Map<number, {sum: number; n: number}>();
  let n = 0, sum = 0;
  for (const row of rows) {
    const at = new Date(row.signalAt).getTime();
    if (!Number.isFinite(at) || !Number.isFinite(row.signedMove) || Math.abs(row.signedMove) > 100) continue;
    // Fixed epoch anchor, never moved to improve the observed result. Seven-day blocks start Thursday UTC.
    const key = Math.floor(at / (DAY_MS * blockDays));
    const b = blocks.get(key) ?? {sum: 0, n: 0};
    b.sum += row.signedMove - cost; b.n++; blocks.set(key, b);
    sum += row.signedMove - cost; n++;
  }
  const mean = n ? sum / n : null;
  const g = blocks.size;
  const available = g >= MIN_UNCERTAINTY_BLOCKS;
  const residualSquares = mean === null ? 0 : [...blocks.values()].reduce((s,b) => s + (b.sum - b.n * mean) ** 2, 0);
  const se = available ? Math.sqrt(g / (g - 1) * residualSquares / (n * n)) : null;
  return {
    blockDays, blocks: g, signals: n, excluded: rows.length - n,
    largestBlock: Math.max(0, ...[...blocks.values()].map(b => b.n)),
    mean, low: se === null ? null : mean! - 1.96 * se, high: se === null ? null : mean! + 1.96 * se,
    status: available ? 'available' : 'insufficient_blocks',
  };
}
