/** A zero outcome count cannot estimate a rate or risk-adjusted performance. */
export function sampledMetric(value: number | null | undefined, sampleSize: number, digits = 2, suffix = ''): string {
  return sampleSize > 0 && value != null && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : 'Unavailable';
}

export function sampledProfitFactor(value: number | null | undefined, trades: number, winners: number, losers: number): string {
  if (!trades) return 'Unavailable';
  if (losers === 0) return winners > 0 ? 'No losing trades' : 'Unavailable';
  return sampledMetric(value, trades);
}
