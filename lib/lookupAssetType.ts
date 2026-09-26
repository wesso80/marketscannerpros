import { detectAssetClass } from './detectAssetClass';

/**
 * Asset type for a symbol typed into a research lookup (Terminal, Golden Egg). A typed symbol is a new instrument, so
 * its type comes from the symbol itself, never from the page's current asset (RS-24: BTC-USD typed while on AAPL was
 * sent as type=equity). Client-safe.
 */

/** Base ticker of a crypto pair: BTC-USD, BTC/USDT, ETHUSDC → BTC / ETH. Other symbols are returned upper-cased. */
export function cryptoPairBase(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[-/]?(USDT|USDC|USD)$/, '');
}

export function lookupAssetType(symbol: string, knownCryptoBases: ReadonlySet<string> = new Set()): 'crypto' | 'equity' {
  const s = symbol.trim().toUpperCase();
  if (!s) return 'equity';
  if (knownCryptoBases.has(s) || knownCryptoBases.has(cryptoPairBase(s))) return 'crypto';
  return detectAssetClass(s);
}
