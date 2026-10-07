import { isPaidTier } from '@/lib/tiers';
import { symbolHref } from '@/lib/market/links';

/** Free-tier markets. Forex is retired and is not offered. */
export const START_HERE_MARKETS = [
  { id: 'crypto', label: 'Crypto', symbol: 'BTC' },
  { id: 'equity', label: 'US stocks', symbol: 'AAPL' },
] as const;

export type StartMarket = (typeof START_HERE_MARKETS)[number]['id'];
export type StartHereStatus = 'done' | 'skipped';

export const START_HERE_STATUS_KEY = 'msp:start-here:status';
export const START_HERE_MARKET_KEY = 'msp:start-here:market';
export const START_HERE_RESULT_KEY = 'msp:start-here:result';

const RETIRED_MARKETS = new Set(['forex', 'fx']);

export function shouldShowStartHere(input: {
  isLoggedIn: boolean;
  isLoading?: boolean;
  isAdmin?: boolean;
  tier: string | null | undefined;
  status: StartHereStatus | null;
}): boolean {
  if (input.isLoading || !input.isLoggedIn || input.isAdmin) return false;
  if (input.tier !== 'free' || isPaidTier(input.tier)) return false;
  if (input.status === 'done' || input.status === 'skipped') return false;
  return true;
}

export function marketFromPref(assets: unknown): StartMarket | null {
  if (!Array.isArray(assets)) return null;
  for (const item of assets) {
    if (typeof item !== 'string') continue;
    const value = item.trim().toLowerCase();
    if (value === 'crypto') return 'crypto';
    if (value === 'equity' || value === 'stock' || value === 'stocks') return 'equity';
    if (RETIRED_MARKETS.has(value)) return 'equity';
  }
  return null;
}

/** Keep unrelated saved assets. Drop forex and replace the market choice. */
export function mergeMarketPref(existing: unknown, market: StartMarket): string[] {
  const current = Array.isArray(existing) ? existing.filter((item): item is string => typeof item === 'string') : [];
  const kept = current.filter((item) => {
    const value = item.trim().toLowerCase();
    if (RETIRED_MARKETS.has(value)) return false;
    return marketFromPref([item]) == null;
  });
  return [market, ...kept];
}

export function readStartHereStatus(): StartHereStatus | null {
  try {
    const value = localStorage.getItem(START_HERE_STATUS_KEY);
    return value === 'done' || value === 'skipped' ? value : null;
  } catch {
    return null;
  }
}

export function writeStartHereStatus(status: StartHereStatus) {
  try { localStorage.setItem(START_HERE_STATUS_KEY, status); } catch { /* Private mode still lets the visit continue. */ }
}

export function readStoredMarket(): StartMarket | null {
  try {
    const value = localStorage.getItem(START_HERE_MARKET_KEY);
    if (!value) return null;
    if (value === 'crypto') return 'crypto';
    return 'equity';
  } catch {
    return null;
  }
}

export function writeStoredMarket(market: StartMarket) {
  try { localStorage.setItem(START_HERE_MARKET_KEY, market); } catch { /* The in-page choice still applies. */ }
}

export type StoredScan = { symbol: string; market: StartMarket };

export function readStoredScan(): StoredScan | null {
  try {
    const raw = sessionStorage.getItem(START_HERE_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredScan>;
    if ((parsed.market !== 'crypto' && parsed.market !== 'equity') || typeof parsed.symbol !== 'string' || !parsed.symbol.trim()) return null;
    return { symbol: parsed.symbol.trim(), market: parsed.market };
  } catch {
    return null;
  }
}

export function writeStoredScan(scan: StoredScan) {
  try { sessionStorage.setItem(START_HERE_RESULT_KEY, JSON.stringify(scan)); } catch { /* A refresh can run the scan again. */ }
}

/** Same request the free DemoScan button sends. One request uses one daily scan. */
export function freeScanBody(market: StartMarket, symbol: string) {
  return { type: market, symbols: [symbol], timeframe: 'daily' as const, minScore: 0 };
}

export function symbolsMatch(actual: string | undefined, requested: string) {
  return actual?.replace(/[-/]?(USDT|USD)$/i, '').toUpperCase() === requested.toUpperCase();
}

export function findFreeScanResult<T extends { symbol?: string; score?: number }>(results: T[] | undefined, requested: string): T | null {
  const result = results?.find((item) => symbolsMatch(item.symbol, requested));
  if (!result || typeof result.score !== 'number' || !Number.isFinite(result.score)) return null;
  return result;
}

export function startHereSymbolHref(symbol: string, market: StartMarket) {
  return symbolHref(symbol, market);
}
