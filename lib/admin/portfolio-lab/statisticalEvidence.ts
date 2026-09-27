/** Minimum reporting samples, not a claim of statistical significance. */
export const MIN_RETURN_OBSERVATIONS = 30;
export const MIN_RUIN_TRADES = 30;
const DAY_MS = 86_400_000;

/** Use actual last observations; input order must not decide which quote wins. */
export function lastValuesByUtcDay(
  observations: Array<{ at: string; value: number }>,
  nowMs = Date.now(),
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of [...observations].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at > nowMs || !Number.isFinite(row.value) || row.value < 0) continue;
    result.set(new Date(at).toISOString().slice(0, 10), row.value);
  }
  return result;
}

/** Index i is the return ending on day i. Unknown gaps and today's partial day remain null. */
export function completedDailyReturns(days: string[], values: number[], nowMs = Date.now()): Array<number | null> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return values.map((value, i) => {
    if (i === 0 || days[i] >= today || Date.parse(days[i]) - Date.parse(days[i - 1]) !== DAY_MS) return null;
    const previous = values[i - 1];
    return previous > 0 && Number.isFinite(value) ? (value - previous) / previous : null;
  });
}

/** Do not cross missing valuation days when annualising a 24/7 simulated book. */
export function latestContinuousReturns(days: string[], returns: Array<number | null>, nowMs = Date.now()): number[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let result: number[] = [];
  returns.forEach((value, i) => {
    if (days[i] >= today) return;
    if (value == null) result = [];
    else result.push(value);
  });
  return result;
}

export function dailyRiskAdjusted(returns: number[]): { sharpe: number | null; sortino: number | null; annVol: number | null } {
  const unavailable = { sharpe: null, sortino: null, annVol: null };
  if (returns.length < MIN_RETURN_OBSERVATIONS || returns.some(r => !Number.isFinite(r))) return unavailable;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(variance);
  // Downside deviation against a zero target uses every observation in its denominator.
  const downside = Math.sqrt(returns.reduce((sum, r) => sum + Math.min(0, r) ** 2, 0) / returns.length);
  const annual = Math.sqrt(365); // UTC calendar-day valuations, including weekends.
  return {
    sharpe: sd > 0 ? mean / sd * annual : null,
    sortino: downside > 0 ? mean / downside * annual : null,
    annVol: sd * annual * 100,
  };
}
