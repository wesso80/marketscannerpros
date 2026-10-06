import { getCached, setCached } from '@/lib/redis';

/** Shared response cache. About 15 minutes, one copy for every user and instance. */
export const SHARED_RESPONSE_TTL_SECONDS = 15 * 60;

/**
 * Read a value stored with writeShared.
 * setCached spreads objects and adds `_ts`, so the payload is wrapped as `{ value }`.
 */
export async function readShared<T>(key: string): Promise<T | null> {
  const cached = await getCached<{ value?: T }>(key);
  if (!cached || cached.value == null) return null;
  return cached.value;
}

export async function writeShared<T>(key: string, value: T, ttlSeconds = SHARED_RESPONSE_TTL_SECONDS): Promise<boolean> {
  return setCached(key, { value }, ttlSeconds);
}
