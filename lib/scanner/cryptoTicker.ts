/**
 * Ticker sanity guard for the crypto scan universe.
 *
 * CoinGecko market pages include tokens whose `symbol` is non-Latin (e.g.
 * CJK "meme" tickers). They cannot be resolved by downstream OHLC/derivatives
 * providers and render as garbage in the scanner table, so they are dropped
 * before scoring. Tickers must be plain ASCII alphanumerics (1–15 chars).
 */
const ASCII_TICKER = /^[A-Z0-9]{1,15}$/;

export function isAsciiCryptoTicker(symbol: string): boolean {
  return ASCII_TICKER.test(String(symbol || '').trim().toUpperCase());
}
