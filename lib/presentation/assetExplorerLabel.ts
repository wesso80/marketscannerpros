/**
 * Shared reader labels for the equity explorer and the crypto assets tab.
 * Presentation only — never pass these strings back into scoring, ranking, or a CRCS snapshot.
 *
 * Same pattern as `symbolVerdictLabel`: an explicit table, then a sentence-case
 * fallback. The lookup is the whole string only. Underscores may separate a
 * token (`ZONE_1`). A sentence keeps its own words: single capitalised codes
 * inside prose are not replaced, and camelCase is not split.
 *
 * CRCS is the confluence-weighted risk-adjusted capital score. The chip shows
 * `crcsUser`, the profile-adjusted capital score, not the separate confluence
 * component. ΔHr is `microAdjustment`, the bounded hourly adjustment on the
 * daily base. Zone 1 is the analysis gate. Zone 2 Action is price and alignment.
 * Zone 2 Context is structure, relative strength, volatility, and events.
 * Zone 3 is the extra company or asset block.
 */
export const ASSET_EXPLORER_LABELS: Record<string, string> = {
  CRCS: 'Capital reading',
  'ΔHR': 'Hourly adjustment',
  'ZONE 1': 'Equity analysis gate',
  'ZONE 2 ACTION': 'Price and alignment',
  'ZONE 2 CONTEXT': 'Market context',
  'ZONE 3': 'Additional detail',
  'ZONE 3 INFORMATIONAL': 'Additional detail',
  'ZONE 2 NEWS & GUIDES': 'News and guides',
  'ZONE 3 INSTITUTIONAL TREASURY HOLDINGS': 'Institutional treasury holdings',
};

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

/** Whole-string key. Underscores and the zone separators we pass in are spaces. Hyphens and camelCase stay. */
export function assetExplorerKey(value: string): string {
  return value.trim().replace(/[_·•]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

function plainFallback(value: string): string {
  const words = value.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return 'Not recorded';
  const plain = words.charAt(0).toUpperCase() + words.slice(1);
  return ENGINE_TOKEN.test(plain) ? 'Not recorded' : plain;
}

/** Visible chip and zone text only. Does not change the stored score or zone. */
export function assetExplorerLabel(value: unknown): string {
  if (value == null) return 'Not recorded';
  const raw = String(value).trim();
  if (!raw) return 'Not recorded';
  const mapped = ASSET_EXPLORER_LABELS[assetExplorerKey(raw)];
  if (mapped) return mapped;
  if (/[a-z]/.test(raw)) return raw;
  return plainFallback(raw);
}
