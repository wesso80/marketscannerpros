/**
 * Capital Pressure reference-level names. Presentation only — the level price
 * and weight stay as measured.
 *
 * Same pattern as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback. The lookup is the whole string only. Underscores may separate a
 * token. A sentence is left alone, including a single capitalised word inside
 * it, and camelCase is not split.
 *
 * `UTC_00_09_LOW` / `UTC00_09LOW` is the low of today's UTC hourly candles whose
 * hour is before 09:00 (`app/api/flow/route.ts`). That is the 00:00–09:00 UTC
 * session low. The high sibling is the same window. Prior-day and overnight
 * acronyms keep the names the terminal already shows.
 */
const CAPITAL_LEVEL_LABELS: Record<string, string> = {
  'UTC 00 09 LOW': 'UTC 00:00–09:00 session low',
  'UTC00 09LOW': 'UTC 00:00–09:00 session low',
  'UTC 00 09 HIGH': 'UTC 00:00–09:00 session high',
  'UTC00 09HIGH': 'UTC 00:00–09:00 session high',
  PDL: 'Prior day low',
  PDH: 'Prior day high',
  EQL: 'Equal lows',
  EQH: 'Equal highs',
  ONH: 'Overnight high',
  ONL: 'Overnight low',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

function levelKey(value: string): string {
  return value.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainFallback(value: string): string {
  const words = value.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

/** Visible level name only. Does not change the price or the weight. */
export function capitalLevelLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  if (/^(unknown|unavailable|n\/a|none)$/i.test(raw)) return 'Not measured';
  const mapped = CAPITAL_LEVEL_LABELS[levelKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainFallback(raw);
}
