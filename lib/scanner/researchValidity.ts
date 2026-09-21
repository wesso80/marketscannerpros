/** Validate level geometry before calculating a conventional scenario R:R. */
export function directionalRiskReward(direction: string, entry: number, stop: number, target: number): number | null {
  if (![entry, stop, target].every((n) => Number.isFinite(n) && n > 0)) return null;
  const long = direction === 'bullish' || direction === 'long';
  const short = direction === 'bearish' || direction === 'short';
  if (long && stop < entry && entry < target) return (target - entry) / (entry - stop);
  if (short && target < entry && entry < stop) return (entry - target) / (stop - entry);
  return null;
}

export const HIGH_MSP_SCORE = 70;

/** Count usable rows from the returned population, including rows filtered out of the table. */
export function rowHasWeakData(row: { dataTrust?: { level?: string }; scoreQuality?: { freshnessStatus?: string }; dataQuality?: string }): boolean {
  return Boolean((row.dataTrust && row.dataTrust.level !== 'GOOD')
    || (row.scoreQuality?.freshnessStatus && row.scoreQuality.freshnessStatus !== 'fresh')
    || (row.dataQuality && row.dataQuality !== 'GOOD'));
}
