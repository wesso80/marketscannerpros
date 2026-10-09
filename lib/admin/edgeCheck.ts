import { clusteredMean, type OverlapInterval } from './overlapUncertainty';

/**
 * Edge check: does any group of shared-scan signals show a measurable edge after costs, and does it hold on the
 * later half of its own history? Pure maths so it can be unit-tested; the route supplies the rows.
 *
 * Inputs are fixed-labeller verdicts only (correct / wrong / neutral with a measured 24h move). The move is signed
 * to the call's direction. Costs are an ASSUMED round trip, stated in every response, never measured.
 *
 * Verdicts are evidence labels for research, never instructions:
 *   - insufficient_sample: fewer than MIN_SAMPLE measured signals (or a half below MIN_HALF_SAMPLE);
 *   - no_edge_after_costs: the 95% interval of the after-cost average move includes or sits below zero;
 *   - inconsistent: positive overall but the later half's after-cost average is not above zero;
 *   - positive_after_costs: interval above zero overall AND later half above zero. Still in-sample, not validated.
 */

export interface EdgeRow {
  group: string;
  signalAt: string | Date;
  outcome: string;
  /** 24h move in the call's direction, %. */
  signedMove: number;
}

export type EdgeVerdict = 'insufficient_sample' | 'no_edge_after_costs' | 'inconsistent' | 'positive_after_costs';

export interface HalfStats {
  n: number;
  from: string | null;
  to: string | null;
  avgMoveAfterCost: number | null;
}

export interface EdgeGroup {
  group: string;
  n: number;
  wins: number;
  losses: number;
  neutral: number;
  hitRate: number | null;
  hitRateLow: number | null;
  hitRateHigh: number | null;
  avgMove: number | null;
  avgMoveAfterCost: number | null;
  /** 95% interval of the after-cost average move (normal approximation). */
  moveLow: number | null;
  moveHigh: number | null;
  earlier: HalfStats;
  later: HalfStats;
  verdict: EdgeVerdict;
  overlap: { daily: OverlapInterval; weekly: OverlapInterval };
}

export const MIN_SAMPLE = 30;
export const MIN_HALF_SAMPLE = 15;
export const ASSUMED_COST_PCT = 0.2;
const Z = 1.96;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Wilson 95% interval for a proportion, in %. */
export function wilson(wins: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = wins / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return { low: r1(Math.max(0, centre - half) * 100), high: r1(Math.min(1, centre + half) * 100) };
}

export function meanInterval(values: number[]): { mean: number; low: number; high: number } | null {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, low: mean, high: mean };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const half = Z * Math.sqrt(variance / n);
  return { mean, low: mean - half, high: mean + half };
}

function half(rows: EdgeRow[], cost: number): HalfStats {
  if (!rows.length) return { n: 0, from: null, to: null, avgMoveAfterCost: null };
  const avg = rows.reduce((a, r) => a + r.signedMove, 0) / rows.length - cost;
  return {
    n: rows.length,
    from: new Date(rows[0].signalAt).toISOString(),
    to: new Date(rows[rows.length - 1].signalAt).toISOString(),
    avgMoveAfterCost: r2(avg),
  };
}

export function summariseGroup(group: string, input: EdgeRow[], cost = ASSUMED_COST_PCT): EdgeGroup {
  const rows = [...input].sort((a, b) => new Date(a.signalAt).getTime() - new Date(b.signalAt).getTime());
  const n = rows.length;
  const wins = rows.filter((r) => r.outcome === 'correct').length;
  const losses = rows.filter((r) => r.outcome === 'wrong').length;
  const neutral = n - wins - losses;
  const labelled = wins + losses;
  const hr = wilson(wins, labelled);
  const after = meanInterval(rows.map((r) => r.signedMove - cost));
  // Choose the closest balanced boundary between distinct timestamps. Never split a scan batch.
  // With only one timestamp there is no earlier period, so the comparison stays insufficient.
  let mid = 0;
  let imbalance = Infinity;
  for (let i = 1; i < n; i++) {
    if (new Date(rows[i - 1].signalAt).getTime() === new Date(rows[i].signalAt).getTime()) continue;
    const distance = Math.abs(n - 2 * i);
    if (distance < imbalance) { mid = i; imbalance = distance; }
  }
  const earlier = half(rows.slice(0, mid), cost);
  const later = half(rows.slice(mid), cost);

  const laterMean = meanInterval(rows.slice(mid).map(r => r.signedMove - cost))?.mean ?? 0;

  let verdict: EdgeVerdict;
  if (n < MIN_SAMPLE || earlier.n < MIN_HALF_SAMPLE || later.n < MIN_HALF_SAMPLE || !after) verdict = 'insufficient_sample';
  else if (after.low <= 0) verdict = 'no_edge_after_costs';
  else if (laterMean <= 0) verdict = 'inconsistent';
  else verdict = 'positive_after_costs';

  return {
    group, n, wins, losses, neutral,
    hitRate: labelled ? r1((wins / labelled) * 100) : null,
    hitRateLow: hr?.low ?? null,
    hitRateHigh: hr?.high ?? null,
    avgMove: after ? r2(after.mean + cost) : null,
    avgMoveAfterCost: after ? r2(after.mean) : null,
    moveLow: after ? r2(after.low) : null,
    moveHigh: after ? r2(after.high) : null,
    earlier, later, verdict,
    overlap: { daily: clusteredMean(rows, cost, 1), weekly: clusteredMean(rows, cost, 7) },
  };
}

const VERDICT_ORDER: Record<EdgeVerdict, number> = { positive_after_costs: 0, inconsistent: 1, no_edge_after_costs: 2, insufficient_sample: 3 };

export function edgeCheck(rows: EdgeRow[], cost = ASSUMED_COST_PCT): { overall: EdgeGroup; groups: EdgeGroup[] } {
  const byGroup = new Map<string, EdgeRow[]>();
  for (const r of rows) {
    if (!Number.isFinite(r.signedMove) || Math.abs(r.signedMove) > 100) continue;
    const list = byGroup.get(r.group) ?? [];
    list.push(r);
    byGroup.set(r.group, list);
  }
  const clean = [...byGroup.values()].flat();
  const groups = [...byGroup.entries()]
    .map(([g, list]) => summariseGroup(g, list, cost))
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || (b.avgMoveAfterCost ?? -1e9) - (a.avgMoveAfterCost ?? -1e9));
  return { overall: summariseGroup('All signals', clean, cost), groups };
}
