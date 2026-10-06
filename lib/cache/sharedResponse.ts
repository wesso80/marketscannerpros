import { getCached, getCachedMulti, setCached } from '@/lib/redis';

/** Shared response cache. About 15 minutes, one copy for every user and instance. */
export const SHARED_RESPONSE_TTL_SECONDS = 15 * 60;

type MemoryEntry = { value: unknown; expiresAt: number };

/** Used only when Redis is down, so a miss does not turn into a vendor call on every request. */
const memoryCache = new Map<string, MemoryEntry>();

function readMemory<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function writeMemory<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Test hook. Production calls do not need to clear this. */
export function clearSharedMemory(): void {
  memoryCache.clear();
}

/**
 * Read a value stored with writeShared.
 * setCached spreads objects and adds `_ts`, so the payload is wrapped as `{ value }`.
 */
export async function readShared<T>(key: string): Promise<T | null> {
  const cached = await getCached<{ value?: T }>(key);
  if (cached && cached.value != null) return cached.value;
  return readMemory<T>(key);
}

export async function readSharedMulti<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  const cached = await getCachedMulti<{ value?: T } | null>(keys);
  return keys.map((key, index) => {
    const row = cached[index];
    if (row && row.value != null) return row.value;
    return readMemory<T>(key);
  });
}

export async function writeShared<T>(key: string, value: T, ttlSeconds = SHARED_RESPONSE_TTL_SECONDS): Promise<boolean> {
  const ok = await setCached(key, { value }, ttlSeconds);
  if (!ok) writeMemory(key, value, ttlSeconds);
  return ok;
}
