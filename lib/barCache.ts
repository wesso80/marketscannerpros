import type { OHLCVBar } from '@/lib/indicators';
import { logger } from '@/lib/logger';

export type BarTimeframe = '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' | 'weekly' | 'monthly' | string;
export type BarMarket = 'equity' | 'crypto' | 'forex' | 'commodity' | 'options' | string;

export interface BarCacheMeta {
  key: string;
  hit: boolean;
  ageMs: number;
  ttlMs: number;
  storedAt: string;
  source: 'memory' | 'fetcher';
}

interface CacheEntry {
  bars: OHLCVBar[];
  storedAt: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 750;

export function barCacheTtlMs(timeframe: BarTimeframe): number {
  const tf = String(timeframe).toLowerCase();
  if (['1min', '5min', '15min'].includes(tf)) return 90_000;
  if (['30min', '60min'].includes(tf)) return 10 * 60_000;
  if (tf === 'daily') return 4 * 60 * 60_000;
  if (tf === 'weekly' || tf === 'monthly') return 12 * 60 * 60_000;
  return 5 * 60_000;
}

export function barCacheKey(symbol: string, market: BarMarket, timeframe: BarTimeframe) {
  return `${String(market).toLowerCase()}:${symbol.trim().toUpperCase()}:${String(timeframe).toLowerCase()}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (now - entry.storedAt > entry.ttlMs * 2) memoryCache.delete(key);
  }

  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const sorted = [...memoryCache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (const [key] of sorted.slice(0, memoryCache.size - MAX_CACHE_ENTRIES)) {
    memoryCache.delete(key);
  }
}

export function getCachedBarsOnly(symbol: string, market: BarMarket, timeframe: BarTimeframe): { bars: OHLCVBar[]; meta: BarCacheMeta } | null {
  const key = barCacheKey(symbol, market, timeframe);
  const entry = memoryCache.get(key);
  if (!entry) return null;

  const ageMs = Date.now() - entry.storedAt;
  if (ageMs > entry.ttlMs) {
    memoryCache.delete(key);
    return null;
  }

  return {
    bars: entry.bars,
    meta: { key, hit: true, ageMs, ttlMs: entry.ttlMs, storedAt: new Date(entry.storedAt).toISOString(), source: 'memory' },
  };
}

export function setCachedBars(symbol: string, market: BarMarket, timeframe: BarTimeframe, bars: OHLCVBar[], ttlMs = barCacheTtlMs(timeframe)) {
  const key = barCacheKey(symbol, market, timeframe);
  memoryCache.set(key, { bars, storedAt: Date.now(), ttlMs });
  pruneCache();
  return key;
}

export async function getCachedBars(
  symbol: string,
  market: BarMarket,
  timeframe: BarTimeframe,
  fetcher: () => Promise<OHLCVBar[]>,
  ttlMs = barCacheTtlMs(timeframe),
): Promise<{ bars: OHLCVBar[]; meta: BarCacheMeta }> {
  const cached = getCachedBarsOnly(symbol, market, timeframe);
  if (cached) return cached;

  const key = barCacheKey(symbol, market, timeframe);
  const bars = await fetcher();
  setCachedBars(symbol, market, timeframe, bars, ttlMs);
  logger.debug('bar-cache miss', { key, count: bars.length, ttlMs });
  return {
    bars,
    meta: { key, hit: false, ageMs: 0, ttlMs, storedAt: new Date().toISOString(), source: 'fetcher' },
  };
}

export function getBarCacheStats() {
  const now = Date.now();
  const entries = [...memoryCache.entries()].map(([key, entry]) => ({
    key,
    count: entry.bars.length,
    ageMs: now - entry.storedAt,
    ttlMs: entry.ttlMs,
    stale: now - entry.storedAt > entry.ttlMs,
  }));

  return {
    size: memoryCache.size,
    maxEntries: MAX_CACHE_ENTRIES,
    entries,
  };
}

export function clearBarCache() {
  memoryCache.clear();
}
