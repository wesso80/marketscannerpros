/** Identity carried between research surfaces. A ticker alone is not an instrument. */
export type ResearchAsset = 'equity' | 'crypto' | 'forex' | 'futures';
export type ResearchTimeframe = '15m' | '30m' | '1h' | 'daily' | 'weekly';
export interface ResearchSelection { assetType?: ResearchAsset; timeframe?: ResearchTimeframe }

export function parseResearchAsset(value: string | null | undefined): ResearchAsset | undefined {
  return value === 'equity' || value === 'crypto' || value === 'forex' || value === 'futures' ? value : undefined;
}

export function parseResearchTimeframe(value: string | null | undefined): ResearchTimeframe | undefined {
  if (value === '1d' || value === 'D') return 'daily';
  if (value === '1w' || value === 'W') return 'weekly';
  const normalized = value?.toLowerCase();
  return normalized === '15m' || normalized === '30m' || normalized === '1h' || normalized === 'daily' || normalized === 'weekly' ? normalized : undefined;
}

/** Preserve destination tabs and only carry an explicit, supported identity. */
export function researchHref(href: string, symbol: string, selection: ResearchSelection = {}): string {
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  params.set('symbol', symbol.trim().toUpperCase());
  if (selection.assetType) params.set('type', selection.assetType);
  if (selection.timeframe) params.set('timeframe', selection.timeframe);
  return `${path}?${params}`;
}
