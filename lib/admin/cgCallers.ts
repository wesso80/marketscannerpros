import { AsyncLocalStorage } from 'node:async_hooks';
import { currentAvBudget } from '@/lib/avLimiter';
import { getRedis } from '@/lib/redis';

/** Same prefix as CG_REDIS_PREFIX. Kept here so this module does not import the cap. */
export const CG_CALLER_REDIS_PREFIX = 'admin:cg-credits:v1';

const callerStore = new AsyncLocalStorage<string>();
const memory = new Map<string, Map<string, number>>();

export type CgCallerCounts = Record<string, Record<string, number>>;

/** Caller and endpoint tokens. `|` stays out so a Redis field can be `caller|endpoint`. */
export function cgCallToken(value: string, fallback: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_.:/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return cleaned || fallback;
}

/** Path the fetch actually hit, collapsed to a stable name. */
export function cgEndpointName(path: string): string {
  const bare = path.split('?')[0];
  if (bare.startsWith('/simple/price')) return 'simple/price';
  if (bare.startsWith('/coins/markets')) return 'coins/markets';
  if (bare.includes('/market_chart/range')) return 'market_chart/range';
  if (bare.includes('/market_chart')) return 'market_chart';
  if (bare.includes('/ohlc/range')) return 'ohlc/range';
  if (bare.includes('/ohlc')) return 'ohlc';
  if (bare.startsWith('/coins/categories')) return 'coins/categories';
  if (bare.startsWith('/coins/list/new')) return 'coins/list/new';
  if (bare.startsWith('/coins/top_gainers_losers')) return 'coins/top_gainers_losers';
  if (bare.startsWith('/search/trending')) return 'search/trending';
  if (bare.startsWith('/search')) return 'search';
  if (bare.startsWith('/global/decentralized_finance_defi')) return 'global/defi';
  if (bare.startsWith('/global/market_cap_chart')) return 'global/market_cap_chart';
  if (bare.startsWith('/global')) return 'global';
  if (bare.startsWith('/derivatives')) return 'derivatives';
  if (bare.includes('/tickers')) return 'tickers';
  if (bare.startsWith('/onchain/')) return 'onchain';
  const parts = bare.split('/').filter(Boolean);
  return cgCallToken(parts.slice(0, 2).join('/'), 'unknown');
}

export function runWithCgCaller<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return callerStore.run(cgCallToken(caller, 'unknown'), fn);
}

/** Explicit label wins. A cron that already set an AV feature is named after that feature. */
export function currentCgCaller(): string {
  const explicit = callerStore.getStore();
  if (explicit) return explicit;
  try {
    const feature = currentAvBudget()?.feature;
    if (feature && feature.trim()) return cgCallToken(feature, 'unknown');
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function fieldOf(caller: string, endpoint: string): string {
  return `${cgCallToken(caller, 'unknown')}|${cgCallToken(endpoint, 'unknown')}`;
}

function pruneDays(day: string): void {
  for (const key of memory.keys()) {
    if (key < day) memory.delete(key);
  }
}

function bump(day: string, field: string): void {
  pruneDays(day);
  const row = memory.get(day) ?? new Map<string, number>();
  row.set(field, (row.get(field) ?? 0) + 1);
  memory.set(day, row);
}

function snapshot(day: string): CgCallerCounts {
  const out: CgCallerCounts = {};
  for (const [field, count] of memory.get(day) ?? []) {
    const split = field.indexOf('|');
    if (split <= 0) continue;
    const caller = field.slice(0, split);
    const endpoint = field.slice(split + 1);
    out[caller] = { ...(out[caller] ?? {}), [endpoint]: count };
  }
  return out;
}

function parseHash(raw: Record<string, unknown> | null | undefined): CgCallerCounts {
  const out: CgCallerCounts = {};
  for (const [field, value] of Object.entries(raw ?? {})) {
    const count = Number(value);
    const split = field.indexOf('|');
    if (split <= 0 || !Number.isFinite(count) || count <= 0) continue;
    const caller = field.slice(0, split);
    const endpoint = field.slice(split + 1);
    out[caller] = { ...(out[caller] ?? {}), [endpoint]: count };
  }
  return out;
}

/** One attempt. Memory is immediate. Redis is the cross-process total the admin route reads. */
export function rememberCgCaller(caller: string, endpoint: string, now = Date.now()): void {
  const day = dayOf(now);
  const field = fieldOf(caller, endpoint);
  bump(day, field);
  try {
    const redis = getRedis();
    if (!redis) return;
    const key = `${CG_CALLER_REDIS_PREFIX}:caller:${day}`;
    void Promise.all([redis.hincrby(key, field, 1), redis.expire(key, 8 * 86400)]).catch(() => undefined);
  } catch {
    /* a count must not break the fetch */
  }
}

/** Redis when this process has published any row today. Otherwise the in-process tally. */
export async function readCgCallerCounts(now = Date.now()): Promise<CgCallerCounts> {
  const day = dayOf(now);
  pruneDays(day);
  try {
    const raw = await getRedis()?.hgetall<Record<string, number>>(`${CG_CALLER_REDIS_PREFIX}:caller:${day}`).catch(() => null);
    const parsed = parseHash(raw);
    if (Object.keys(parsed).length > 0) return parsed;
  } catch {
    /* fall through to this process */
  }
  return snapshot(day);
}

/** `caller|endpoint=n` pairs, largest first. `none` when nothing was counted. */
export function formatCgCallerCounts(counts: CgCallerCounts, limit = 12): string {
  const pairs: { field: string; count: number }[] = [];
  for (const [caller, endpoints] of Object.entries(counts)) {
    for (const [endpoint, count] of Object.entries(endpoints)) {
      if (count > 0) pairs.push({ field: `${caller}|${endpoint}`, count });
    }
  }
  pairs.sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
  if (pairs.length === 0) return 'none';
  return pairs.slice(0, limit).map((pair) => `${pair.field}=${pair.count}`).join(',');
}

export function resetCgCallerCountsForTests(): void {
  memory.clear();
}
