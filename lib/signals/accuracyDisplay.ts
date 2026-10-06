/**
 * Display maths for setup-accuracy rows.
 * pct_move in the database is the raw price change. A bearish correct outcome is a
 * price drop, so the raw average is negative. These helpers flip that sign so a
 * favorable move is positive and an adverse move is negative, for both directions.
 * The past-threshold share stays accuracy_pct: correct / (correct + wrong).
 * Neutral outcomes are excluded from that share.
 */

export function signedPctMove(direction: string, rawPct: number): number {
  return String(direction).trim().toLowerCase() === 'bearish' ? -rawPct : rawPct;
}

export function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mean signed move when correct, and when wrong. Favorable is positive. */
export function directionAdjustedMoves(
  direction: string,
  rawWhenCorrect: unknown,
  rawWhenWrong: unknown,
): { avgCorrect: number | null; avgWrong: number | null } {
  const correct = finiteNumber(rawWhenCorrect);
  const wrong = finiteNumber(rawWhenWrong);
  return {
    avgCorrect: correct == null ? null : signedPctMove(direction, correct),
    avgWrong: wrong == null ? null : signedPctMove(direction, wrong),
  };
}

/**
 * (share × favorable average) + (the rest × adverse average).
 * A symmetric 50/50 pair of equal magnitude is 0 for both directions.
 */
export function moveExpectancy(winRatePct: number, avgCorrect: number, avgWrong: number): number {
  const share = winRatePct / 100;
  return share * avgCorrect + (1 - share) * avgWrong;
}

export function formatSignedPercent(value: unknown): string {
  const n = finiteNumber(value);
  if (n == null) return 'Not collected';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function decisiveOutcomes(correct: unknown, wrong: unknown): number {
  return (finiteNumber(correct) ?? 0) + (finiteNumber(wrong) ?? 0);
}

/** accuracy_pct needs this many correct+wrong rows. Neutrals do not count. */
export function pastThresholdLabel(correct: unknown, wrong: unknown, rate: unknown, minSamples: number): string {
  if (decisiveOutcomes(correct, wrong) < minSamples) return 'Not enough data yet';
  const n = finiteNumber(rate);
  if (n == null) return 'Not collected';
  return `${n.toFixed(1)}%`;
}
