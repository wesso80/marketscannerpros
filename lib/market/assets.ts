/** Active scanner choices; persisted legacy asset types remain valid for readers. */
export function scannerAssetType(value: unknown): 'crypto'|'equity' {
  return value == null || value === '' || value === 'crypto' ? 'crypto' : 'equity';
}
export function assetDisplayLabel(value: string): string {
  return value === 'forex' ? 'Forex (retired)' : value === 'equity' ? 'Stocks' : value === 'crypto' ? 'Crypto' : value;
}
