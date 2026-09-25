/**
 * Pro Scanner scan-mode resolution (pure, client-safe).
 *
 * Crypto used to offer "Fast" (`light`) and "Deep" scans. Fast ranked the CoinGecko market-cap list on price change /
 * turnover / rank and only pulled real candles for the top 10, so every other row reached the canonical engine with
 * no technical inputs and came back BLOCK / "No setup" (and was dropped by the default factor-agreement filter).
 * Fast has been retired: every Pro crypto scan is Deep. A leftover `light`/`hybrid` crypto request (old client,
 * bookmarked state) is run as Deep instead of returning empty results. Equity and forex are unchanged.
 */
export type BulkScanMode = 'deep' | 'light' | 'hybrid';

export function resolveBulkScanMode(type: unknown, requestedMode: unknown): BulkScanMode {
  if (type === 'crypto') return 'deep';
  const requested = String(requestedMode ?? '').toLowerCase();
  return requested === 'hybrid' ? 'hybrid' : requested === 'light' ? 'light' : 'deep';
}

/** True when a client asked for the retired crypto Fast scan (reported back so the response is transparent). */
export function isRetiredFastCryptoRequest(type: unknown, requestedMode: unknown): boolean {
  const requested = String(requestedMode ?? '').toLowerCase();
  return type === 'crypto' && (requested === 'light' || requested === 'hybrid' || requested === 'fast');
}
