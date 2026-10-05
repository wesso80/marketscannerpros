/** Display-only labels. Never alters provider rows, ordering, scores or rules. */
const names: Record<string, string> = {
  PDL: 'Prior day low', PDH: 'Prior day high', EQL: 'Equal lows', EQH: 'Equal highs',
  PREV_WEEK_HIGH: 'Prior week high', PREV_WEEK_LOW: 'Prior week low',
  WEEK_HIGH: 'Week high', WEEK_LOW: 'Week low', ONH: 'Overnight high', ONL: 'Overnight low',
  GAP_REF: 'Gap level', ROUND: 'Round number',
};
export function levelName(value: string): string {
  const key = value.trim().replace(/\s+/g, '_').toUpperCase();
  return names[key] ?? key.toLowerCase().replaceAll('_', ' ');
}
export function sweepPrice(value: number): string {
  if (!Number.isFinite(value)) return 'Not collected';
  return '$' + (Math.abs(value) < 1 && value !== 0 ? Number(value.toPrecision(4)).toString() : value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
}
export function sweepSession(dates: Array<string | undefined>): string {
  const valid = [...new Set(dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d))))].sort();
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  if (!valid.length) return 'Session date not collected';
  if (valid.length === 1) return `Last session · ${label(valid[0])}`;
  return `Mixed sessions · ${label(valid[0])} to ${label(valid[valid.length - 1])}`;
}
