/** Bar widths as a percent of the largest absolute change in the same list. */
export function sessionChangeBarWidths(changes: Array<number | null | undefined>): Array<number | null> {
  let max = 0;
  for (const change of changes) {
    if (typeof change === 'number' && Number.isFinite(change)) max = Math.max(max, Math.abs(change));
  }
  return changes.map((change) => {
    if (typeof change !== 'number' || !Number.isFinite(change)) return null;
    if (max <= 0) return 0;
    return (Math.abs(change) / max) * 100;
  });
}
