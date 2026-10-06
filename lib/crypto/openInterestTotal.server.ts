import { getDerivativesTickers } from '@/lib/coingecko';
import { sumOpenInterestTotals, type OpenInterestTotal } from './openInterestTotal';

/**
 * Perpetual total from the existing CoinGecko derivatives client (top venues by open interest).
 * Returns null when that client fails. It does not substitute 0 or the fixed basket.
 */
export async function getOpenInterestTotals(symbols: readonly string[], now = Date.now()): Promise<OpenInterestTotal[] | null> {
  try {
    const tickers = await getDerivativesTickers();
    if (tickers == null) return null;
    return sumOpenInterestTotals(tickers, symbols, now);
  } catch {
    return null;
  }
}
