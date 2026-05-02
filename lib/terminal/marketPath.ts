export type MarketPath = 'equity' | 'crypto' | 'futures';

const FUTURES_CODES = new Set([
  'ES',
  'NQ',
  'YM',
  'RTY',
  'CL',
  'GC',
  'SI',
  'M2K',
  'MES',
  'MNQ',
  'MCL',
  'MGC',
]);

const CRYPTO_CODES = new Set(['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ATOMUSD']);
const FX_PAIRS = new Set(['AUDUSD', 'EURUSD', 'NZDUSD', 'GBPUSD']);

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

function stripFuturesPrefix(symbol: string): string {
  const withoutSlash = symbol.startsWith('/') ? symbol.slice(1) : symbol;
  return withoutSlash.replace(/[0-9]+$/, '');
}

export function detectMarketPath(symbol: string): MarketPath {
  const normalized = normalizeSymbol(symbol);
  const futureRoot = stripFuturesPrefix(normalized);

  if (normalized.startsWith('/') || FUTURES_CODES.has(normalized) || FUTURES_CODES.has(futureRoot)) {
    return 'futures';
  }

  if (CRYPTO_CODES.has(normalized) || (normalized.endsWith('USD') && !FX_PAIRS.has(normalized))) {
    return 'crypto';
  }

  return 'equity';
}
