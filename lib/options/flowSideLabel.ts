/**
 * Display label for a snapshot side code.
 *
 * `bought` / `sold` / `neutral` are the classifier's bid/ask buckets, not a trade print:
 * last at or through the ask, and last in the ask-side 30% of the spread, both store `bought`;
 * the bid side stores `sold`; the middle of the spread stores `neutral`.
 * The label does not reclassify.
 */
export function flowSideLabel(direction: string | null | undefined): string {
  if (direction === 'bought') return 'Near ask';
  if (direction === 'sold') return 'Near bid';
  return 'Mid';
}
