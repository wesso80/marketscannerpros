/**
 * Reader labels for the volatility page badges and section headings.
 * Presentation only — never fed back into the directional volatility calculation.
 *
 * Same pattern as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback so an unknown engine token does not stay on the badge.
 *
 * Codes match the five engine layers plus the supporting block:
 * VOL linear volatility state, DIR directional bias, PH phase persistence,
 * SIG signal and invalidation, PROJ outcome projection, SUP supporting analysis.
 */
const BADGES: Record<string, string> = {
  VOL: 'Volatility',
  DIR: 'Direction',
  PH: 'Phase',
  SIG: 'Signal',
  PROJ: 'Projection',
  SUP: 'Support',
};

const HEADINGS: Record<string, string> = {
  VOL: 'Volatility state',
  DIR: 'Directional bias',
  PH: 'Phase persistence',
  SIG: 'Signal and invalidation',
  PROJ: 'Outcome projection',
  SUP: 'Supporting analysis',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

function layerKey(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainEngineFallback(value: string): string {
  const words = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

function fromTable(table: Record<string, string>, value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = table[layerKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainEngineFallback(raw);
}

export function volatilityBadgeLabel(value: unknown): string {
  return fromTable(BADGES, value);
}

export function volatilityHeadingLabel(value: unknown): string {
  return fromTable(HEADINGS, value);
}
