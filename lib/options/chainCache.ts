/**
 * One short-lived cache for raw Alpha Vantage option chains, shared by every route that needs a
 * whole chain (Options Scanner analyzer + strike picker, expiry dropdown, Golden Egg / DVE, the
 * Intraday Charts GEX estimate, the Options Terminal on a miss).
 *
 * Before this, the same symbol's chain was downloaded 2-3 times per screen and two routes wrote
 * different shapes under the same Redis key. Now:
 *  - rows are always requested with require_greeks=true (one shape every caller can use);
 *  - kept in process memory and in Redis under `opt:raw:SYM` for CHAIN_CACHE_TTL_SECONDS;
 *  - concurrent requests for the same symbol share one in-flight download.
 * Alpha Vantage's artificial "premium endpoint" sample chain is never cached (usableOptionRows).
 */
import { usableOptionRows } from '@/lib/options/avChain';
import { getCached, setCached } from '@/lib/redis';

export type AvChainFunction = 'REALTIME_OPTIONS_FMV' | 'REALTIME_OPTIONS' | 'HISTORICAL_OPTIONS';

export interface SharedOptionsChain<T = Record<string, any>> {
  rows: T[];
  provider: AvChainFunction;
  /** Top-level date fields from the AV payload (used for data-date detection). */
  payloadMeta: { date?: string; lastRefreshed?: string; last_refreshed?: string };
  fetchedAt: number;
  warnings: string[];
  cacheHit: boolean;
}

/** Fetches one AV payload. Throw or return null to move on to the next provider. */
export type ChainPayloadFetcher = (fn: AvChainFunction, url: string) => Promise<any>;

export const CHAIN_CACHE_TTL_SECONDS = 120;
const MAX_MEMORY_ENTRIES = 12;

export const optionsRawChainKey = (symbol: string) => `opt:raw:${symbol.trim().toUpperCase()}`;

type MemoryEntry = { value: Omit<SharedOptionsChain, 'cacheHit' | 'warnings'>; expires: number };
// Kept on globalThis so every module instance (dev HMR, test module resets) shares one process cache.
const store = globalThis as typeof globalThis & {
  __mspOptionsChainMemory?: Map<string, MemoryEntry>;
  __mspOptionsChainInflight?: Map<string, Promise<SharedOptionsChain | null>>;
};
const memory = (store.__mspOptionsChainMemory ??= new Map<string, MemoryEntry>());
const inflight = (store.__mspOptionsChainInflight ??= new Map<string, Promise<SharedOptionsChain | null>>());

export function clearSharedOptionsChainCache(): void {
  memory.clear();
  inflight.clear();
}

export function defaultChainProviders(): AvChainFunction[] {
  const realtime = (process.env.AV_OPTIONS_REALTIME_ENABLED ?? 'true').toLowerCase() !== 'false';
  return realtime ? ['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS'] : ['HISTORICAL_OPTIONS'];
}

function fromMemory(key: string) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function remember(key: string, value: Omit<SharedOptionsChain, 'cacheHit' | 'warnings'>) {
  memory.delete(key);
  memory.set(key, { value, expires: value.fetchedAt + CHAIN_CACHE_TTL_SECONDS * 1000 });
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/**
 * Returns the full (all expiries) chain for `symbol`, or null when no provider returned real contracts.
 * `providers` is only the download order on a cache miss; a cached chain from any provider is returned.
 */
export async function fetchSharedOptionsChain<T = Record<string, any>>(
  symbol: string,
  opts: { apiKey: string; fetchPayload: ChainPayloadFetcher; providers?: AvChainFunction[] },
): Promise<SharedOptionsChain<T> | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym || !opts.apiKey) return null;
  const key = optionsRawChainKey(sym);

  const mem = fromMemory(key);
  if (mem) return { ...(mem as any), warnings: ['cache_hit'], cacheHit: true };

  const pending = inflight.get(key);
  if (pending) {
    const shared = await pending;
    return shared ? { ...(shared as any), cacheHit: true } : null;
  }

  const task = (async (): Promise<SharedOptionsChain | null> => {
    try {
      const cached = await getCached<Omit<SharedOptionsChain, 'cacheHit' | 'warnings'>>(key);
      if (cached && Array.isArray(cached.rows) && cached.rows.length > 0 && Date.now() - Number(cached.fetchedAt || 0) < CHAIN_CACHE_TTL_SECONDS * 1000) {
        const value = { rows: cached.rows, provider: cached.provider, payloadMeta: cached.payloadMeta || {}, fetchedAt: cached.fetchedAt };
        remember(key, value);
        return { ...value, warnings: ['cache_hit'], cacheHit: true };
      }
    } catch { /* Redis optional */ }

    const warnings: string[] = [];
    for (const fn of opts.providers ?? defaultChainProviders()) {
      const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(sym)}&require_greeks=true&apikey=${opts.apiKey}`;
      let payload: any;
      try {
        payload = await opts.fetchPayload(fn, url);
      } catch (err) {
        warnings.push(`${fn}:fetch_failed`);
        console.warn(`[optionsChain] ${fn} ${sym} unavailable: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
        continue;
      }
      if (!payload) {
        warnings.push(`${fn}:no_data`);
        continue;
      }
      const rows = usableOptionRows(payload, sym);
      if (!rows) {
        warnings.push(Array.isArray(payload?.data) && payload.data.length ? `${fn}:not_entitled_sample_data` : `${fn}:empty_data`);
        continue;
      }
      const value = {
        rows,
        provider: fn,
        payloadMeta: { date: payload?.date, lastRefreshed: payload?.lastRefreshed, last_refreshed: payload?.last_refreshed },
        fetchedAt: Date.now(),
      };
      remember(key, value);
      try { await setCached(key, value, CHAIN_CACHE_TTL_SECONDS); } catch { /* Redis optional */ }
      return { ...value, warnings, cacheHit: false };
    }
    console.warn(`[optionsChain] no usable chain for ${sym}: ${warnings.join(', ')}`);
    return null;
  })();

  inflight.set(key, task);
  try {
    return (await task) as SharedOptionsChain<T> | null;
  } finally {
    inflight.delete(key);
  }
}
