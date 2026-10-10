/**
 * Which feed prices one alert.
 *
 * The shared scan resolver (resolveScanAsset) declares the crypto price batch's
 * market as CRYPTO. A ticker that is also on the equity list then comes back
 * ambiguous, and the crypto batch skips it. That is correct for a crypto alert:
 * Chevron must not be priced as Convex.
 *
 * An alert whose asset class is equity is not that case. The crypto alias does
 * not change the feed.
 */
import { alertSymbolKey } from '@/lib/alerts/cryptoPriceBatch';
import { quoteSourceFor, type QuoteSource } from '@/lib/alerts/assetTypes';

export interface AlertAssetInput {
  assetType: string | null | undefined;
  symbol: string;
  /** True when a coin map or search hit also claims this ticker. Ignored for an explicit equity alert. */
  inCryptoMap: boolean;
  equitySymbols: readonly string[];
}

export type AlertAssetDecision =
  | { source: 'stock' | 'forex' | 'unsupported'; skipped: false }
  | { source: 'crypto'; skipped: false }
  | { source: 'crypto'; skipped: true; detail: string };

function explicitEquity(assetType: string): boolean {
  return assetType === 'equity'
    || assetType === 'equities'
    || assetType === 'stock'
    || assetType === 'stocks'
    || assetType === 'etf';
}

export function resolveAlertAsset(input: AlertAssetInput): AlertAssetDecision {
  const explicit = String(input.assetType ?? '').trim().toLowerCase();
  if (explicitEquity(explicit)) {
    return { source: 'stock', skipped: false };
  }
  if (explicit === 'crypto' || explicit === 'cryptocurrency' || explicit === 'coin' || explicit === 'coins') {
    const key = alertSymbolKey(input.symbol);
    const onEquityList = input.equitySymbols.some((row) => alertSymbolKey(row) === key);
    if (onEquityList) {
      const alias = input.inCryptoMap ? ' and a coin alias' : '';
      return {
        source: 'crypto',
        skipped: true,
        detail: `${key} is an equity ticker${alias} and is not priced as a coin`,
      };
    }
    return { source: 'crypto', skipped: false };
  }
  const source: QuoteSource = quoteSourceFor(explicit);
  if (source === 'crypto') return { source: 'crypto', skipped: false };
  return { source, skipped: false };
}
