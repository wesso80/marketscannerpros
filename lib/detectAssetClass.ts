/**
 * Shared asset class detection — single source of truth.
 * Used by TimeScannerPage, CloseCalendar, TimeGravityMap API, and anywhere
 * else that needs to distinguish crypto from equity symbols.
 */

export type AssetClass = 'crypto' | 'equity';

const KNOWN_CRYPTO_BASES = new Set([
  // Tier 1 — large cap
  'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'POL',
  'LINK', 'UNI', 'SHIB', 'ATOM', 'LTC', 'BCH', 'APT', 'SUI', 'TON', 'TRX',
  'NEAR', 'FIL', 'AAVE', 'ARB', 'OP', 'INJ', 'TIA', 'SEI', 'HBAR', 'XLM',
  'FET', 'RENDER', 'RNDR', 'ICP', 'IMX', 'GRT', 'PEPE', 'WIF', 'BONK', 'FLOKI',
  'BNB', 'CRO', 'MKR', 'RUNE', 'SNX', 'COMP', 'ALGO',
  // Tier 2 — mid cap & DeFi / gaming / infrastructure
  'EOS', 'XTZ', 'THETA', 'XMR', 'NEO', 'SUSHI', 'YFI', 'CRV', 'BAL', 'REN',
  '1INCH', 'ENJ', 'MANA', 'SAND', 'AXS', 'CHZ', 'FTM', 'EGLD', 'FLOW',
  'AR', 'HNT', 'STX', 'KSM', 'ZEC', 'DASH', 'WAVES', 'KAVA', 'CELO',
  'JUP', 'KAS', 'XCN', 'PYTH', 'PENDLE', 'BLUR', 'APE', 'VET',
]);

const CRYPTO_QUOTE_SUFFIXES = ['USD', 'USDT', 'USDC', 'BUSD', 'BTC', 'ETH'];

export function detectAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().trim();

  // 1. Check if the base (stripping common quote suffixes) is a known crypto
  for (const suffix of CRYPTO_QUOTE_SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) {
      const base = s.slice(0, -suffix.length);
      if (KNOWN_CRYPTO_BASES.has(base)) return 'crypto';
    }
  }

  // 2. Bare ticker matches (e.g. just "BTC" without a quote currency)
  if (KNOWN_CRYPTO_BASES.has(s)) return 'crypto';

  // 3. Fallback: symbols ending in USD that aren't standard equity tickers
  //    (equity symbols don't normally end in "USD")
  if (s.endsWith('USD') && s.length <= 10) return 'crypto';

  return 'equity';
}
