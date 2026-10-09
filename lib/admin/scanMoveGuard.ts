/**
 * Admin scan day-change gate. Same symbol resolver and 50% cap as the outcome labeller.
 * A crypto move past 50%, or a ticker that is both a coin and a stock, is not published as a real change.
 */
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import { unionWatchlistSymbols } from '@/lib/operator/watchlists';
import {
  inCryptoSymbolMap,
  publishScanChange,
  resolveScanAsset,
  symbolBase,
  type PublishedScanChange,
  type ScanMarket,
} from '@/lib/signals/outcomeGuard';

let equitySymbols: readonly string[] | null = null;

function equityUniverse(): readonly string[] {
  equitySymbols ??= unionWatchlistSymbols('EQUITIES');
  return equitySymbols;
}

export function scanMarket(market: string | null | undefined): ScanMarket {
  return String(market ?? '').toUpperCase() === 'CRYPTO' ? 'crypto' : 'equity';
}

export function guardScanChangePercent(
  symbol: string,
  market: string,
  changePercent: number | null | undefined,
): PublishedScanChange {
  const asset = resolveScanAsset({
    symbol,
    market,
    inCryptoMap: inCryptoSymbolMap(symbolBase(symbol), COINGECKO_ID_MAP),
    equitySymbols: equityUniverse(),
  });
  return publishScanChange(changePercent, asset, scanMarket(market));
}
