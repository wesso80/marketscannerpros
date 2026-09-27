/** Daily loss uses consecutive UTC account-equity snapshots, never lifetime P&L. */
export type RiskEquitySnapshot = {
  snapshot_date: string;
  total_value: string | number;
  total_pl: string | number;
  snapshot_basis: string | null;
};

export function measureDailyRisk(rows: RiskEquitySnapshot[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const clean = rows.filter(r => r.snapshot_basis === 'account_equity_v2');
  const current = clean.find(r => r.snapshot_date === today);
  const prior = clean.find(r => r.snapshot_date === yesterday);
  const equity = current ? Number(current.total_value) : NaN;
  const baseline = prior ? Number(prior.total_value) : NaN;
  const currentPnl = current ? Number(current.total_pl) : NaN;
  const priorPnl = prior ? Number(prior.total_pl) : NaN;
  const equityKnown = Number.isFinite(equity) && equity > 0;
  const known = equityKnown && Number.isFinite(baseline) && baseline > 0
    && Number.isFinite(currentPnl) && Number.isFinite(priorPnl);
  // Cumulative P&L change excludes deposits/withdrawals from the numerator.
  const dailyPnl = known ? currentPnl - priorPnl : 0;
  return {
    equity: equityKnown ? equity : 0,
    dailyPnl,
    dailyDrawdown: known ? Math.max(0, -dailyPnl / baseline) : 0,
    dailyDrawdownKnown: known,
    dailyRiskBaselineEquity: known ? baseline : null,
    dailyRiskAsOf: current ? today : null,
    dailyRiskBasis: known ? 'account_equity_v2 UTC snapshot P&L change / prior-day equity' : 'unavailable',
  };
}
