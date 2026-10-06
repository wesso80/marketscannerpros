/**
 * Display text for outcome thresholds (outcome_thresholds table). The labelling rule itself is unchanged:
 * bullish = OK when move >= +correct, NO when move <= -wrong; bearish mirrored; between = neutral.
 * The old chip "OK >=0.5% NO <=0.5%" dropped the minus sign, so 0.50% read as both OK and NO.
 */
const fmt = (n: number) => Number(n).toFixed(2).replace(/\.?0+$/, '');
export function thresholdChip(t: { horizon_label: string; correct_threshold: number; wrong_threshold: number }) {
  return `${t.horizon_label}: OK at +${fmt(t.correct_threshold)}% or more · NO at −${fmt(t.wrong_threshold)}% or worse`;
}
export const THRESHOLD_RULE_NOTE =
  'Moves are measured in the signal’s direction. A move exactly at the threshold counts as OK; NO needs at least the threshold against the signal; anything in between is neutral.';
/** Plain status when observations exist but none are labelled yet (no empty stats). */
export function collectionStatus(total: number, labeled: number) {
  if (total > 0 && labeled === 0) return `Results are still being collected: ${total.toLocaleString()} observations recorded, none labelled yet.`;
  return null;
}
