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

  // ─────────────────────────────────────────────────────────────
  // Diamonds-in-the-rough universes. Smaller, less-followed
  // names where the ARCA edge engine can find asymmetric setups
  // before consensus rotates in. Equity-only universes are
  // scanned during the US session; crypto runs 24/7.
  // ─────────────────────────────────────────────────────────────

  'us-small-cap-value': {
    name: 'US Small-Cap Value',
    market: 'EQUITIES',
    symbols: [
      'MLI', 'ATKR', 'CRS', 'SKYW', 'BOOT', 'PLUS', 'CALM', 'HRB',
      'COOP', 'PRDO', 'IBP', 'MHO', 'CVCO', 'GHC', 'NPK', 'OFG',
      'CNS', 'AROC', 'PARR', 'TGNA', 'WHD', 'SLVM', 'JBI', 'PAGS',
      'YOU',
    ],
  },

  'us-mid-cap-momentum': {
    name: 'US Mid-Cap Momentum',
    market: 'EQUITIES',
    symbols: [
      'TOST', 'AFRM', 'HOOD', 'SOFI', 'UBER', 'DASH', 'CVNA', 'SPOT',
      'DKNG', 'SHOP', 'TTD', 'MELI', 'NU', 'GLBE', 'AS', 'CRWV',
      'DELL', 'WDC', 'STX', 'ANET', 'CRDO', 'ALAB', 'ASTS', 'VST',
      'TLN', 'GEV', 'OKLO', 'SMR', 'CEG', 'BWXT',
    ],
  },

  'us-biotech': {
    name: 'US Biotech / Catalyst',
    market: 'EQUITIES',
    symbols: [
      'VRTX', 'REGN', 'BIIB', 'MRNA', 'BNTX', 'NVAX', 'BMRN', 'INSM',
      'NTLA', 'BEAM', 'CRSP', 'EDIT', 'SRPT', 'IONS', 'ALNY', 'EXAS',
      'CRNX', 'KRYS', 'RXRX', 'VKTX', 'MDGL', 'IMVT', 'ARWR', 'IOVA',
      'TGTX',
    ],
  },

  'us-fintech-disruptors': {
    name: 'US Fintech / Payments Disruptors',
    market: 'EQUITIES',
    symbols: [
      'SQ', 'PYPL', 'AFRM', 'SOFI', 'HOOD', 'COIN', 'MSTR', 'UPST',
      'LMND', 'NU', 'PAGS', 'BILL', 'TOST', 'MARA', 'RIOT', 'CLSK',
      'HUT', 'WULF', 'CIFR', 'IREN', 'BTBT',
    ],
  },

  'us-ai-infrastructure': {
    name: 'US AI Picks-and-Shovels',
    market: 'EQUITIES',
    symbols: [
      'NVDA', 'AMD', 'AVGO', 'MRVL', 'TSM', 'ASML', 'AMAT', 'LRCX',
      'KLAC', 'MU', 'ARM', 'CRDO', 'ALAB', 'CRWV', 'NBIS', 'VRT',
      'ETN', 'PWR', 'GEV', 'CEG', 'VST', 'TLN', 'ANET', 'CIEN',
      'COHR', 'LITE', 'DELL', 'SMCI',
    ],
  },

  'us-energy-transition': {
    name: 'US Energy Transition',
    market: 'EQUITIES',
    symbols: [
      'ENPH', 'SEDG', 'FSLR', 'RUN', 'ARRY', 'NXT', 'SHLS', 'PLUG',
      'BE', 'BLDP', 'LCID', 'RIVN', 'CHPT', 'BLNK', 'ALB', 'LAC',
      'SQM', 'MP', 'UEC', 'CCJ', 'NXE', 'DNN', 'LEU', 'SMR',
      'OKLO', 'NNE',
    ],
  },

  'us-defensive-cashflow': {
    name: 'US Defensive Cashflow',
    market: 'EQUITIES',
    symbols: [
      'PG', 'KO', 'PEP', 'WMT', 'COST', 'MCD', 'CL', 'KMB',
      'GIS', 'K', 'MDLZ', 'HSY', 'CHD', 'CLX', 'TGT', 'DG',
      'DLTR', 'WBA', 'CVS', 'O', 'STAG', 'VICI', 'NEE', 'D',
      'SO', 'DUK', 'AEP',
    ],
  },

  'crypto-altcoins': {
    name: 'Crypto Altcoins (L1/L2)',
    market: 'CRYPTO',
    symbols: [
      'LTC', 'BCH', 'ATOM', 'ALGO', 'XLM', 'FIL', 'ICP', 'HBAR',
      'VET', 'FLOW', 'EGLD', 'XTZ', 'IMX', 'STX', 'SEI', 'TIA',
      'JTO', 'JUP', 'PYTH', 'WIF', 'ORDI', 'BONK', 'PEPE', 'SHIB',
      'TON',
    ],
  },

  'crypto-ai-tokens': {
    name: 'Crypto AI Tokens',
    market: 'CRYPTO',
    symbols: [
      'TAO', 'FET', 'RNDR', 'AGIX', 'OCEAN', 'WLD', 'AKT', 'GRT',
      'ROSE', 'AR', 'NMR', 'CTXC', 'RLC', 'PHB',
    ],
  },

  'crypto-gaming-meta': {
    name: 'Crypto Gaming / Metaverse',
    market: 'CRYPTO',
    symbols: [
      'IMX', 'AXS', 'SAND', 'MANA', 'GALA', 'ENJ', 'APE', 'ILV',
      'BEAM', 'PIXEL', 'PRIME', 'RON',
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

/**
 * Deduped union of every DEFAULT_WATCHLISTS symbol whose market matches.
 * `pinned` symbols are placed at the head in given order (used to keep
 * SPY/QQQ/BTC/ETH anchors in front of the diamonds-in-the-rough lists).
 *
 * Admin-only: this returns the full operator universe (~120 equities,
 * ~70 crypto). Do not expose to public endpoints — see no-public-leakage.
 */
export function unionWatchlistSymbols(market: Market, pinned: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sym of pinned) {
    const s = sym.toUpperCase();
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  for (const wl of Object.values(DEFAULT_WATCHLISTS)) {
    if (wl.market !== market) continue;
    for (const sym of wl.symbols) {
      const s = sym.toUpperCase();
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}
