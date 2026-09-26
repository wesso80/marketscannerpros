/**
 * CAGR from clean account-equity snapshots, or null when there isn't enough history to annualise honestly.
 *
 * Gated like Sharpe / Max DD (the clean-history readiness check: >= 5 account-equity snapshots plus
 * server risk analytics), and additionally needs the snapshots to span at least MIN_CAGR_SPAN_DAYS:
 * annualising a few days of change produces extreme figures (e.g. -100.00% or +5000%).
 */
export const MIN_CAGR_SPAN_DAYS = 30;

export function cagrFromEquityHistory(
  points: Array<{ timestamp: string; totalValue: number }>,
  opts: { ready: boolean; minSpanDays?: number },
): number | null {
  if (!opts.ready || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 86_400_000;
  if (!Number.isFinite(spanDays) || spanDays < (opts.minSpanDays ?? MIN_CAGR_SPAN_DAYS)) return null;
  if (!(first.totalValue > 0) || !(last.totalValue > 0)) return null;
  return (Math.pow(last.totalValue / first.totalValue, 365 / spanDays) - 1) * 100;
}
