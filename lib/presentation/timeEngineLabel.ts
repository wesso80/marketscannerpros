/**
 * Reader labels for Time Confluence nested panels. Presentation only.
 *
 * Same pattern as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback so an unknown ALL_CAPS engine token never stays on screen. Do not pass
 * these strings back into scoring, scans, or API payloads.
 *
 * Time Confluence keeps its existing after-run length (the documented exception).
 * This helper only renames reader-visible codes. It does not add folds or rows.
 */
const LABELS: Record<string, string> = {
  'TARGET ACTIVE': 'Active target',
  'TARGET HIT': 'Target reached',
  'TARGET OVERSHOT': 'Target passed',
  HIT: 'Reached',
  OVERSHOT: 'Passed',
  RECOMPUTING: 'Recalculating',
  EXPANSION: 'Expansion',
  'NO TARGET': 'No active target',
  'MOMENTUM OVERRIDE': 'Momentum leading',
  MAGNET: 'Magnet',
  'LOW PRIORITY': 'Low priority',
  COMPRESSION: 'Compression',
  'PRE WINDOW': 'Before window',
  'POST WINDOW': 'After window',
  'IN WINDOW': 'In window',
  TAGGED: 'Reached',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  UNKNOWN: 'Not recorded',
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending',
  FAILED: 'Not confirmed',
  'RANGE SPIKE': 'Range spike',
  'BREAK HOLD': 'Break and hold',
  'AOI TARGET ZONES': 'Target zones',
  AOI: 'Area of interest',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

function engineKey(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainEngineFallback(value: string): string {
  const words = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

/** One engine code or status. Mixed prose is returned unchanged so notes stay intact. */
export function timeEngineLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = LABELS[engineKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainEngineFallback(raw);
}

/** Decompression ACTIVE means the window is open, not that a price target is live. */
export function decompressionStatusLabel(status: unknown): string {
  if (engineKey(String(status ?? '')) === 'ACTIVE') return timeEngineLabel('IN WINDOW');
  return timeEngineLabel(status);
}

/** Banner line. Numbers and the existing descriptive tails stay; only the code changes. */
export function targetStatusLine(status: unknown, price: string | null, overshotCount: number): string {
  const key = engineKey(String(status ?? ''));
  const shown = price && price.trim() ? price : '—';
  if (key === 'ACTIVE') return `${timeEngineLabel('TARGET ACTIVE')}: ${shown}`;
  if (key === 'TARGET HIT') return `${timeEngineLabel('TARGET HIT')} — All midpoints tagged`;
  if (key === 'OVERSHOT') return `${timeEngineLabel('TARGET OVERSHOT')} — Price blew past ${overshotCount} midpoint(s)`;
  if (key === 'EXPANSION') return `${timeEngineLabel('MOMENTUM OVERRIDE')} — Expansion targets active`;
  if (key === 'RECOMPUTING') return `${timeEngineLabel('RECOMPUTING')} — Finding next target...`;
  if (key === 'NO TARGET') return 'No active gravity targets';
  return timeEngineLabel(status);
}

/**
 * Free text. A value that is only an engine code is mapped. Inside a sentence, only
 * underscore tokens are mapped. Single capital words (LONG, SHORT, PASS, EXPANSION)
 * stay, and camelCase is not split.
 */
export function timeEngineProse(value: unknown): string {
  if (value == null) return 'Not recorded';
  const text = String(value);
  const trimmed = text.trim();
  if (!trimmed) return 'Not recorded';
  if (LABELS[engineKey(trimmed)] || ENGINE_TOKEN.test(trimmed)) return timeEngineLabel(trimmed);
  return text.replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, (token) => {
    const mapped = LABELS[engineKey(token)];
    if (mapped) return mapped;
    if (/[a-z]/.test(token)) return token;
    return plainEngineFallback(token);
  });
}
