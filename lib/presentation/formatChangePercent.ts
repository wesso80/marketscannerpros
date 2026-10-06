/**
 * Display-only percentage change, rounded to two decimals.
 * Accepts a number or a string such as "-0.2397%". Does not round stored quotes.
 *
 * `symbolNumber(..., 'percent')` stays at one decimal for other surfaces.
 * This helper is the shared two-decimal change format.
 */
export function formatChangePercent(value: unknown): string {
  const numeric = readChangePercent(value);
  if (numeric == null) return 'Not recorded';
  const text = numeric.toFixed(2);
  if (Number(text) === 0) return '0.00%';
  return `${numeric > 0 ? '+' : ''}${text}%`;
}

function readChangePercent(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/%/g, '').replace(/,/g, '');
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}
