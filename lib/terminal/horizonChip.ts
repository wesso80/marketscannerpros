/**
 * Plain horizon copy for Terminal Close Calendar.
 * A missing day count returns null so the chip can be omitted.
 * No schedule math: this only formats a number the caller already has.
 */

export function horizonChipLabel(days: number | null | undefined): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return null;
  const count = Math.round(days);
  return count === 1 ? '1 day' : `${count} days`;
}

/** Collapsed Futures schedule-range chip. Omits the horizon when it has no value. */
export function futuresScheduleRangeSummary(horizonDays: number | null | undefined, anchorLabel?: string | null): string {
  const parts = ['Today'];
  const horizon = horizonChipLabel(horizonDays);
  if (horizon) parts.push(horizon);
  const anchor = anchorLabel?.trim();
  if (anchor) parts.push(anchor);
  return parts.join(', ');
}

/** Horizon line. "to" replaces the old arrow glyph that rendered as "?". */
export function terminalHorizonLabel(days: number | null | undefined, endLabel?: string | null): string | null {
  const horizon = horizonChipLabel(days);
  if (!horizon) return null;
  const end = endLabel?.trim();
  return end ? `${horizon} to ${end}` : horizon;
}
