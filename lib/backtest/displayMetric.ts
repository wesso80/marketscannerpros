/** A zero outcome count cannot estimate a rate or risk-adjusted performance. */
export function sampledMetric(value: number | null | undefined, sampleSize: number, digits = 2, suffix = ''): string {
  return sampleSize > 0 && value != null && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : 'Unavailable';
}

export function sampledProfitFactor(value: number | null | undefined, trades: number, winners: number, losers: number): string {
  if (!trades) return 'Unavailable';
  if (losers === 0) return winners > 0 ? 'No losing trades' : 'Unavailable';
  return sampledMetric(value, trades);
}

export const NO_LOSING_TRADES = 'None (no losing trades)';
export const NO_WINNING_TRADES = 'None (no winning trades)';

/**
 * The engine's worstTrade / bestTrade are just the lowest / highest-return trades, so with no losers the "worst" is a
 * winner (BT-8: "Largest Loss +9.5%" in red) and with no winners the "best" is a loser. A trade only fills the
 * Largest Loss cell when it lost money, and the Largest Gain cell when it made money.
 */
export function largestLossTrade<T extends { returnPercent?: number | string | null }>(worst: T | null | undefined): T | null {
  const r = Number(worst?.returnPercent);
  return worst && Number.isFinite(r) && r < 0 ? worst : null;
}

export function largestGainTrade<T extends { returnPercent?: number | string | null }>(best: T | null | undefined): T | null {
  const r = Number(best?.returnPercent);
  return best && Number.isFinite(r) && r > 0 ? best : null;
}
