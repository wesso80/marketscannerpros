/** "$489.0B" style net assets for the sector ETF panel (MV-6). */
export function formatNetAssets(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return 'n/a';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
