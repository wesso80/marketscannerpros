/**
 * MSP Operator — Default Watchlists
 * Pre-configured symbol lists per market for auto-scan mode.
 * @internal
 */

import type { Market } from '@/types/operator';

export interface WatchlistEntry {
  name: string;
  market: Market;
  symbols: string[];
}

/** Built-in watchlists grouped by market */
export const DEFAULT_WATCHLISTS: Record<string, WatchlistEntry> = {
  'us-mega-cap': {
    name: 'US Mega-Cap',
    market: 'EQUITIES',
    symbols: [
      'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B',
      'AVGO', 'JPM', 'LLY', 'UNH', 'V', 'MA', 'XOM', 'COST', 'HD', 'PG',
      'JNJ', 'NFLX',
    ],
  },
  'us-momentum': {
    name: 'US Momentum / Growth',
    market: 'EQUITIES',
    symbols: [
      'NVDA', 'AMD', 'SMCI', 'ARM', 'PLTR', 'CRWD', 'PANW', 'SNOW',
      'DDOG', 'NET', 'COIN', 'MSTR', 'APP', 'IONQ', 'RGTI', 'RKLB',
    ],
  },
  'crypto-majors': {
    name: 'Crypto Majors',
    market: 'CRYPTO',
    symbols: [
      'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT',
      'LINK', 'MATIC', 'UNI', 'NEAR', 'APT', 'SUI', 'FET', 'RNDR',
    ],
  },
  'crypto-defi': {
    name: 'Crypto DeFi / AI',
    market: 'CRYPTO',
    symbols: [
      'UNI', 'AAVE', 'MKR', 'CRV', 'LDO', 'FET', 'RNDR', 'TAO',
      'NEAR', 'AR', 'OCEAN', 'GRT', 'INJ', 'PENDLE',
    ],
  },
  'forex-majors': {
    name: 'Forex Majors',
    market: 'FOREX',
    symbols: [
      'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'USDCHF', 'EURGBP',
    ],
  },
};

/** Get symbols for a given watchlist key */
export function getWatchlistSymbols(key: string): string[] {
  return DEFAULT_WATCHLISTS[key]?.symbols ?? [];
}

/** Get all watchlist keys for a given market */
export function getWatchlistsForMarket(market: Market): string[] {
  return Object.entries(DEFAULT_WATCHLISTS)
    .filter(([, wl]) => wl.market === market)
    .map(([key]) => key);
}
