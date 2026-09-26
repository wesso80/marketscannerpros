/**
 * Input validation for the public share-card images (/api/share/*). Pure.
 *
 * Inputs only ever select stored rows (a report date, a ticker). Nothing from the URL is drawn on the card except
 * values read back from the database, so the endpoints cannot be used to render arbitrary text.
 */

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 675;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Tickers such as AAPL, BRK.B, BTC-USD, 7203.T. Letters, digits, one "." or "-" suffix. */
const SYMBOL_RE = /^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,5})?$/;

/** A real calendar date (YYYY-MM-DD) between 2020-01-01 and tomorrow (UTC), else null. */
export function parseShareDate(raw: string | null | undefined, now = Date.now()): string | null {
  if (typeof raw !== 'string') return null;
  const m = DATE_RE.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  if (t < Date.UTC(2020, 0, 1) || t > now + 86_400_000) return null;
  return raw;
}

/** Upper-cased ticker if it matches the ticker pattern, else null. */
export function parseShareSymbol(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length > 16) return null;
  const s = raw.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

/** Split "<name>.png" (the last path segment). Only .png is served; returns the name or null. */
export function parsePngFile(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length > 24) return null;
  const m = /^([A-Za-z0-9.-]+)\.png$/.exec(raw);
  return m ? m[1] : null;
}

/**
 * Characters outside the renderer's bundled font (Noto Sans, Latin subset) make next/og download a font from Google
 * at render time. Common ones get an ASCII stand-in; anything else outside the subset (emoji, CJK, symbols) is dropped.
 */
const GLYPH_STANDINS: Record<string, string> = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '≈': '~', '−': '-' };
const OUTSIDE_FONT = /[^\u0020-\u007e\u00a0-\u00ff\u2000-\u206f\u20ac\u2122]/gu;

export function toFontSafe(s: string): string {
  return s.replace(/[≥≤→←≈−]/g, (c) => GLYPH_STANDINS[c] ?? '').replace(OUTSIDE_FONT, '');
}

/** Display text from stored data: font-safe, control characters removed, whitespace collapsed, clipped with an ellipsis. */
export function clipText(v: unknown, max: number): string {
  const s = toFontSafe(String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…` : s;
}
