export type CashBridgeState = {
  future: string;
  etf: string;
  cashIndex: string;
  label: string;
};

export const FUTURES_CASH_BRIDGES: Record<string, CashBridgeState> = {
  '/ES': {
    future: '/ES',
    etf: 'SPY',
    cashIndex: 'SPX',
    label: '/ES ↔ SPY ↔ SPX',
  },
  '/NQ': {
    future: '/NQ',
    etf: 'QQQ',
    cashIndex: 'NDX',
    label: '/NQ ↔ QQQ ↔ NDX',
  },
  '/YM': {
    future: '/YM',
    etf: 'DIA',
    cashIndex: 'DJI',
    label: '/YM ↔ DIA ↔ DJI',
  },
  '/RTY': {
    future: '/RTY',
    etf: 'IWM',
    cashIndex: 'RUT',
    label: '/RTY ↔ IWM ↔ RUT',
  },
};

const COMMODITY_ROOTS = new Set(['/CL', '/GC', '/SI', '/MCL', '/MGC']);

function normalizeFutureSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  if (upper.startsWith('/')) {
    return upper;
  }
  return `/${upper}`;
}

export function getCashBridge(symbol: string): CashBridgeState | null {
  const normalized = normalizeFutureSymbol(symbol);
  return FUTURES_CASH_BRIDGES[normalized] ?? null;
}

export function hasCommoditySessionMap(symbol: string): boolean {
  const normalized = normalizeFutureSymbol(symbol);
  return COMMODITY_ROOTS.has(normalized);
}

export function getCashBridgeFallbackMessage(): string {
  return 'No cash-index bridge available. Use commodity/session logic instead.';
}
