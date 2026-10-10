/**
 * Negative cache for Alpha Vantage intraday calls that answer "Invalid API call".
 *
 * Daily history for these symbols can still be current, so they stay out of the
 * static skip list in unsupportedAvSymbol.ts. One invalid intraday response
 * stores av:invalid-intraday:<SYMBOL> for 7 days. Later runs skip the call
 * until that entry expires, then try again.
 * Redis is the shared copy. When Redis is missing or a command throws, an
 * in-process map keeps the same expiry for this process.
 */

export const INVALID_INTRADAY_TTL_SEC = 7 * 24 * 60 * 60;
export const INVALID_INTRADAY_KEY_PREFIX = 'av:invalid-intraday:';

export function invalidIntradayKey(symbol: string): string {
  return `${INVALID_INTRADAY_KEY_PREFIX}${String(symbol ?? '').trim().toUpperCase()}`;
}

export function isAvInvalidApiCall(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /invalid api call/i.test(msg);
}

export interface InvalidIntradayRedis {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>;
}

export interface InvalidIntradayScan {
  del(key: string): Promise<unknown>;
  scan(cursor: number | string, opts: { match: string; count: number }): Promise<[string | number, string[]]>;
}

const memoryExpiresAt = new Map<string, number>();
const loggedKeys = new Set<string>();

export function resetInvalidIntradayCacheForTests(): void {
  memoryExpiresAt.clear();
  loggedKeys.clear();
}

function forget(key: string): void {
  memoryExpiresAt.delete(key);
  loggedKeys.delete(key);
}

function memoryBlocked(key: string, nowMs: number): boolean {
  const exp = memoryExpiresAt.get(key);
  if (exp == null) return false;
  if (exp <= nowMs) {
    forget(key);
    return false;
  }
  return true;
}

function expiresAtFromRedis(raw: unknown, nowMs: number): number | null {
  if (raw == null || raw === '') return null;
  const exp = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(exp) && exp > 1e12) return exp;
  return nowMs + INVALID_INTRADAY_TTL_SEC * 1000;
}

export async function invalidIntradayBlocked(
  symbol: string,
  redis: InvalidIntradayRedis | null,
  nowMs: number,
): Promise<boolean> {
  const key = invalidIntradayKey(symbol);
  if (key.endsWith(':')) return false;
  if (!redis) return memoryBlocked(key, nowMs);
  try {
    const expiresAt = expiresAtFromRedis(await redis.get(key), nowMs);
    if (expiresAt == null || expiresAt <= nowMs) {
      forget(key);
      return false;
    }
    memoryExpiresAt.set(key, expiresAt);
    return true;
  } catch {
    return memoryBlocked(key, nowMs);
  }
}

export async function rememberInvalidIntraday(
  symbol: string,
  redis: InvalidIntradayRedis | null,
  nowMs: number,
  log: (line: string) => void = (line) => console.warn(line),
): Promise<void> {
  const upper = String(symbol ?? '').trim().toUpperCase();
  if (!upper) return;
  const key = invalidIntradayKey(upper);
  const expiresAt = nowMs + INVALID_INTRADAY_TTL_SEC * 1000;
  memoryExpiresAt.set(key, expiresAt);
  if (redis) {
    try {
      await redis.set(key, String(expiresAt), { ex: INVALID_INTRADAY_TTL_SEC });
    } catch {
      /* The in-process entry still skips the next call in this process. */
    }
  }
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  log(`[worker] ${upper}: Alpha Vantage intraday returned Invalid API call; skipping for 7 days (${key})`);
}

export type InvalidIntradayFetch<T> =
  | { ok: true; value: T; calls: number }
  | { ok: false; calls: number; skipped: boolean; invalid: boolean; error: unknown };

/** One intraday fetch, or zero when a negative-cache entry is still inside its 7 days. */
export async function fetchWithInvalidIntradayCache<T>(
  symbol: string,
  fetchOnce: () => Promise<T>,
  redis: InvalidIntradayRedis | null,
  nowMs: number,
  opts?: { log?: (line: string) => void; rememberInvalid?: boolean },
): Promise<InvalidIntradayFetch<T>> {
  const log = opts?.log;
  const rememberInvalid = opts?.rememberInvalid !== false;
  if (await invalidIntradayBlocked(symbol, redis, nowMs)) {
    return { ok: false, calls: 0, skipped: true, invalid: true, error: null };
  }
  try {
    const value = await fetchOnce();
    return { ok: true, value, calls: 1 };
  } catch (error) {
    if (isAvInvalidApiCall(error)) {
      if (rememberInvalid) await rememberInvalidIntraday(symbol, redis, nowMs, log);
      return { ok: false, calls: 1, skipped: false, invalid: true, error };
    }
    return { ok: false, calls: 1, skipped: false, invalid: false, error };
  }
}

async function scanInvalidKeys(redis: InvalidIntradayScan): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | number = 0;
  for (let i = 0; i < 50; i++) {
    const [next, batch] = await redis.scan(cursor, { match: `${INVALID_INTRADAY_KEY_PREFIX}*`, count: 100 });
    for (const key of batch) {
      if (key.startsWith(INVALID_INTRADAY_KEY_PREFIX)) keys.push(key);
    }
    cursor = next;
    if (String(cursor) === '0') break;
  }
  return keys;
}

export async function clearInvalidIntraday(
  redis: InvalidIntradayScan | null,
  scope: { symbol: string } | { all: true },
): Promise<string[]> {
  if ('all' in scope) {
    for (const key of [...memoryExpiresAt.keys()]) {
      if (key.startsWith(INVALID_INTRADAY_KEY_PREFIX)) forget(key);
    }
    if (!redis) return [];
    const keys = await scanInvalidKeys(redis);
    for (const key of keys) {
      await redis.del(key);
      forget(key);
    }
    return keys;
  }
  const key = invalidIntradayKey(scope.symbol);
  if (key.endsWith(':')) return [];
  forget(key);
  if (redis) await redis.del(key);
  return [key];
}
