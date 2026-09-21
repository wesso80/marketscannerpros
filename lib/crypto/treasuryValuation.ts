/** Comparing provider totals cannot establish realised P&L for sold holdings. */
export function treasuryValueVsCost(holdings: number, cost: number, value: number) {
  const hasCostBasis = Number.isFinite(cost) && cost > 0;
  const available = hasCostBasis && Number.isFinite(holdings) && holdings > 0 && Number.isFinite(value) && value >= 0;
  return {
    hasCostBasis,
    profitLossUsd: available ? value - cost : null,
    profitLossPercent: available ? ((value - cost) / cost) * 100 : null,
    unavailableReason: available ? null : !hasCostBasis ? 'Cost basis not supplied' : holdings === 0 ? 'No current holdings; sales proceeds unavailable' : 'Valuation unavailable',
  };
}

export function formatTreasuryUsd(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable';
  const magnitude = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (magnitude >= 1e9) return `${sign}$${(magnitude / 1e9).toFixed(2)}B`;
  if (magnitude >= 1e6) return `${sign}$${(magnitude / 1e6).toFixed(1)}M`;
  if (magnitude >= 1e3) return `${sign}$${(magnitude / 1e3).toFixed(0)}K`;
  return `${sign}$${magnitude.toFixed(0)}`;
}
