import { getCached, setCached } from '@/lib/redis';

/** Inside the 30–60s window. Long enough that one page load shares one upstream read. */
export const SHORT_RESPONSE_TTL_SECONDS = 45;

const MEMORY_MAX_ENTRIES = 200;

export type ResponseTier = 'free' | 'pro' | 'signed-out';

type MemoryEntry = { value: unknown; expiresAt: number };

const memoryCache = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readMemory<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return cloneJson(hit.value as T);
}

function writeMemory<T>(key: string, value: T, ttlSeconds: number): void {
  const now = Date.now();
  for (const [entryKey, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(entryKey);
  }
  memoryCache.delete(key);
  memoryCache.set(key, { value: cloneJson(value), expiresAt: now + ttlSeconds * 1000 });
  while (memoryCache.size > MEMORY_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest === undefined) break;
    memoryCache.delete(oldest);
  }
}

/** Drops this process's short entries. Redis is left for the caller to clear. */
export function clearShortResponseCache(): void {
  memoryCache.clear();
  inflight.clear();
}

/**
 * Free, Pro, and signed-out never share a key. A visitor has no account tier,
 * so it uses signed-out. Bypass is Pro: the cached value is the market packet,
 * not that caller's quota or evidence token.
 */
export function responseTier(input: {
  quotaOn: boolean;
  signedIn: boolean;
  paid: boolean;
  plan?: 'visitor' | 'free' | 'pro' | null;
  bypass?: boolean;
}): ResponseTier {
  if (input.quotaOn) {
    if (input.bypass || input.plan === 'pro') return 'pro';
    if (input.plan === 'free') return 'free';
    return 'signed-out';
  }
  if (!input.signedIn) return 'signed-out';
  return input.paid ? 'pro' : 'free';
}

export function goldenEggCacheKey(
  tier: ResponseTier,
  parts: { symbol: string; timeframe: string; assetClass: string; expiry?: string | null },
): string {
  return `route:golden-egg:v1:${tier}:${parts.symbol}:${parts.timeframe}:${parts.assetClass}:${parts.expiry ?? ''}`;
}

/**
 * Tiered HTTP bodies stay `private, no-store` because they still carry that
 * caller's quota and evidence token. Shared authenticated bodies are private
 * for the cookie, with a max-age that matches this TTL.
 */
export function shortCacheControl(tiered: boolean): string {
  return tiered ? 'private, no-store' : `private, max-age=${SHORT_RESPONSE_TTL_SECONDS}`;
}

/** A loader throws this when the result must be returned and must not be stored. */
export class UncachedBody extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super('uncached');
    this.status = status;
    this.body = body;
  }
}

export type ShortCacheHit = 'memory' | 'redis' | 'miss';

async function readRedis<T>(key: string): Promise<T | null> {
  const cached = await getCached<{ value?: T }>(key);
  if (cached && cached.value != null) return cached.value;
  return null;
}

/**
 * One load per key in this process. Memory is written on every store, including
 * a Redis hit, so the next call does not touch Redis or the loader. The stored
 * JSON is returned unchanged, including asOf and stale.
 */
export async function loadShortCached<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { ttlSeconds?: number; bypass?: boolean },
): Promise<{ value: T; hit: ShortCacheHit }> {
  const ttlSeconds = options?.ttlSeconds ?? SHORT_RESPONSE_TTL_SECONDS;
  if (options?.bypass) {
    const value = cloneJson(await loader());
    writeMemory(key, value, ttlSeconds);
    await setCached(key, { value }, ttlSeconds);
    return { value: cloneJson(value), hit: 'miss' };
  }

  const cached = readMemory<T>(key);
  if (cached) return { value: cached, hit: 'memory' };

  const pending = inflight.get(key) as Promise<{ value: T; hit: ShortCacheHit }> | undefined;
  if (pending) return pending.then((row) => ({ value: cloneJson(row.value), hit: row.hit }));

  const flight = (async () => {
    const shared = await readRedis<T>(key);
    if (shared != null) {
      writeMemory(key, shared, ttlSeconds);
      return { value: cloneJson(shared), hit: 'redis' as const };
    }
    const value = cloneJson(await loader());
    writeMemory(key, value, ttlSeconds);
    await setCached(key, { value }, ttlSeconds);
    return { value: cloneJson(value), hit: 'miss' as const };
  })();

  inflight.set(key, flight);
  try {
    return await flight;
  } finally {
    if (inflight.get(key) === flight) inflight.delete(key);
  }
}
