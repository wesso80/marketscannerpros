/**
 * IV rank/percentile only when it was actually measured (needs IV history — none is stored today).
 * null = unknown: callers show "n/a" and treat it as neutral (no points either way); never substitute 50.
 */
export function measuredIvRank(
  ivAnalysis: { ivRank?: number | null; ivRankHeuristic?: number | null } | null | undefined,
): number | null {
  const v = ivAnalysis?.ivRank ?? ivAnalysis?.ivRankHeuristic ?? null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
