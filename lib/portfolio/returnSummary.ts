/**
 * Portfolio return figures and the state labels built from them (TR-3).
 *
 * - Open return: unrealized P&L / cost of the open positions (what the "Total return" card used to show).
 * - Total return: realized + unrealized P&L / capital put in (starting capital + net deposits), so closed
 *   trades count. Null when there is no capital base.
 * - Drawdown labels ("Elevated Drawdown", Risk load, Defensive) use the measured drawdown from peak account
 *   equity, only once clean equity history is ready (same gate as the Drawdown / Max DD figures). A negative
 *   return on its own is not called a drawdown.
 */

export interface ReturnInputs {
  unrealizedPL: number;
  realizedPL: number;
  openCost: number;
  startingCapital: number;
  netDeposits: number;
}

export function portfolioReturns(input: ReturnInputs): { openReturnPct: number; totalReturnPct: number | null } {
  const openReturnPct = input.openCost > 0 ? (input.unrealizedPL / input.openCost) * 100 : 0;
  const capitalBase = input.startingCapital + input.netDeposits;
  const totalReturnPct = capitalBase > 0 ? ((input.unrealizedPL + input.realizedPL) / capitalBase) * 100 : null;
  return { openReturnPct, totalReturnPct };
}

/** Current drawdown from peak equity (positive %), or null until clean equity history is ready. */
export function measuredDrawdownPct(
  performanceHistory: Array<{ basis?: string; totalValue: number }>,
  riskAnalytics: { currentDrawdown?: number | null } | null | undefined,
): number | null {
  const clean = performanceHistory.filter((p) => p.basis === 'account_equity_v2' && p.totalValue > 0);
  if (clean.length < 5 || !riskAnalytics) return null;
  const dd = Number(riskAnalytics.currentDrawdown);
  return Number.isFinite(dd) ? Math.max(0, dd) : null;
}

export function portfolioStateLabels(input: { totalReturnPct: number; drawdownPct: number | null; concentrationPct: number }) {
  const { totalReturnPct: ret, concentrationPct: conc } = input;
  const dd = input.drawdownPct ?? 0;
  const riskLoadLabel = dd > 20 || conc > 50 ? 'High' : dd > 8 || conc > 35 ? 'Medium' : 'Low';
  const portfolioHealthLabel = dd > 20
    ? 'Elevated Drawdown'
    : dd > 5 || ret < -5
    ? 'Below Baseline'
    : ret > 12
    ? 'Above Baseline'
    : 'Near Baseline';
  const edgeStateLabel = dd > 10 || conc > 50 ? 'Defensive' : ret > 10 && conc < 35 ? 'Offensive' : 'Neutral';
  const biasLabel = ret > 2 ? 'Bullish' : ret < -2 ? 'Bearish' : 'Neutral';
  return { riskLoadLabel, portfolioHealthLabel, edgeStateLabel, biasLabel } as const;
}
