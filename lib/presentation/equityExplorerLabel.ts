/**
 * Equity Explorer reader labels. Presentation only — never pass these strings
 * back into scoring, ranking, or a CRCS snapshot.
 *
 * Same pattern as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback so a raw engine token does not stay on the page.
 *
 * CRCS is the confluence-weighted risk-adjusted capital score. The chip shows
 * `crcsUser`, the profile-adjusted capital score, not the separate confluence
 * component. ΔHr is `microAdjustment`, the bounded hourly adjustment on the
 * daily base. Zone 1 is the analysis gate (eligibility, capital mode, volatility,
 * environment). Zone 2 Action is price, chart, and alignment. Zone 2 Context is
 * structure, relative strength, volatility, and events. Zone 3 is the extra
 * company block (valuation, fundamentals, technicals, news).
 */
const EQUITY_EXPLORER_LABELS: Record<string, string> = {
  CRCS: 'Capital score',
  'ΔHR': 'Hourly adjustment',
  'ZONE 1': 'Equity analysis gate',
  'ZONE 2 ACTION': 'Price and alignment',
  'ZONE 2 CONTEXT': 'Market context',
  'ZONE 3': 'Additional detail',
  'ZONE 3 INFORMATIONAL': 'Additional detail',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

function explorerKey(value: string): string {
  return value.trim().replace(/[_·•-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainFallback(value: string): string {
  const words = value.trim().replace(/[_·•-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

/** Visible Equity Explorer text only. Does not change the stored score or zone. */
export function equityExplorerLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = EQUITY_EXPLORER_LABELS[explorerKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainFallback(raw);
}
