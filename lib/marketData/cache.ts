/**
 * marketData/cache.ts — Redis layer for hot paths.
 *
 * Pattern: read-through. Callers use lib/marketData/index.ts; this file
 * is the Redis half. Postgres half lives in store.ts. AV half lives in
 * client.ts.
 *
 * Keys are namespaced under `md:` to avoid collisions with the legacy
 * `bars:` / `quote:` keys used by the public-facing worker.
 */

import { getRedis } from '@/lib/redis';

const NS = 'md:';

interface CachePayload<T> {
  data: T;
  fetchedAt: string;
}

export async function rGet<T>(key: string): Promise<CachePayload<T> | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get<CachePayload<T>>(NS + key);
    if (!v || typeof v !== 'object' || !('fetchedAt' in v)) return null;
    return v;
  } catch {
    return null;
  }
}

export async function rSet<T>(key: string, data: T, fetchedAt: string, ttlSec: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(NS + key, { data, fetchedAt } satisfies CachePayload<T>, { ex: ttlSec });
  } catch {
    // swallow — cache is best-effort
  }
}

export const CK = {
  bars: (symbol: string, timeframe: string) => `bars:${symbol.toUpperCase()}:${timeframe}`,
  quote: (symbol: string) => `quote:${symbol.toUpperCase()}`,
  overview: (symbol: string) => `overview:${symbol.toUpperCase()}`,
  earnings: (symbol: string) => `earnings:${symbol.toUpperCase()}`,
  optionsChain: (symbol: string) => `opt:chain:${symbol.toUpperCase()}`,
  indicators: (symbol: string, timeframe: string) => `ind:${symbol.toUpperCase()}:${timeframe}`,
  news: (symbol: string, sinceISO: string) => `news:${symbol.toUpperCase()}:${sinceISO.slice(0, 10)}`,
} as const;
