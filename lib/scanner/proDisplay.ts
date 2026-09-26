/** Small display helpers for the Scanner's Pro results (table and cards). Pure. */

/**
 * Crypto rows are shown with the "-USD" quote suffix (as the Ranked tab does), so a coin such as AR (Arweave) cannot be
 * mistaken for the stock of the same ticker (AR = Antero Resources). The row's own `symbol` is unchanged: analysis is
 * opened with the asset class, so clicking AR opens the coin.
 */
export function proDisplaySymbol(symbol: string, assetClass: string | null | undefined): string {
  if (assetClass !== 'crypto' || !symbol) return symbol;
  return /-(USD|USDT|USDC)$/i.test(symbol) ? symbol : `${symbol}-USD`;
}

/** Price with sensible precision for anything from BTC to sub-cent coins; '—' when unknown. */
export function formatScannerPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
}
