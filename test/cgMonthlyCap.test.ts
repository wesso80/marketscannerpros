import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const holder = vi.hoisted(() => ({ redis: null as FakeRedis | null }));

type FakeRedis = {
  store: Map<string, unknown>;
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<string>;
  incr: (key: string) => Promise<number>;
  decr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, number>>;
  incrby: (key: string, by: number) => Promise<number>;
  hincrby: (key: string, field: string, by: number) => Promise<number>;
  eval?: (script: string, keys: string[], args: string[]) => Promise<number[]>;
};

function makeRedis(): FakeRedis {
  const store = new Map<string, unknown>();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async set(key, value) { store.set(key, value); return 'OK'; },
    async incr(key) {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    async decr(key) {
      const next = Number(store.get(key) ?? 0) - 1;
      store.set(key, next);
      return next;
    },
    async expire() { return 1; },
    async hgetall() { return {}; },
    async incrby(key, by) {
      const next = Number(store.get(key) ?? 0) + by;
      store.set(key, next);
      return next;
    },
    async hincrby() { return 1; },
  };
}

vi.mock('@/lib/redis', () => ({ getRedis: () => holder.redis }));

import { getSimplePrices, resetCgResponseCacheForTests } from '@/lib/coingecko';
import {
  cgQuota,
  cgTargetPct,
  flatDailyCap,
  pacedDailyCap,
  perProcessDailyCap,
  planDailyCap,
  resetCgCapStateForTests,
  utcMonthParts,
} from '@/lib/admin/cgDailyCap';
import { cgBudgetStatus } from '@/lib/admin/cgCredits';

const OCT31 = Date.UTC(2026, 9, 31, 12, 0, 0);

function seedKey(redis: FakeRedis, now: number, used: number, quota = 500_000) {
  redis.store.set('admin:cg-credits:v1:key', {
    at: new Date(now).toISOString(),
    key: {
      plan: 'Analyst',
      monthly_call_credit: quota,
      current_total_monthly_calls: used,
      current_remaining_monthly_calls: Math.max(0, quota - used),
    },
  });
}

function priceResponse(usd = 42) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ bitcoin: { usd, usd_24h_change: 1 } }),
    text: async () => '',
  };
}

beforeEach(() => {
  holder.redis = makeRedis();
  resetCgCapStateForTests();
  resetCgResponseCacheForTests();
  vi.stubEnv('CG_MONTHLY_CREDITS', '500000');
  vi.stubEnv('CG_TARGET_PCT', '80');
  vi.stubEnv('CG_ESTIMATED_PROCESSES', '4');
  vi.stubEnv('COINGECKO_API_KEY', 'CG-test');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCT31);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('daily cap math', () => {
  it('uses the env quota and 80% target, with documented defaults', () => {
    expect(cgQuota({})).toBe(500_000);
    expect(cgQuota({ CG_MONTHLY_CREDITS: '250000' })).toBe(250_000);
    expect(cgTargetPct({})).toBe(80);
    expect(cgTargetPct({ CG_TARGET_PCT: '80' })).toBe(80);
    expect(flatDailyCap(500_000, 80, 31)).toBe(Math.floor(400_000 / 31));
    expect(pacedDailyCap(500_000, 80, 100_000, 10)).toBe(30_000);
    expect(pacedDailyCap(500_000, 80, 400_000, 10)).toBe(0);
    expect(pacedDailyCap(500_000, 80, 399_999, 1)).toBe(1);
    expect(perProcessDailyCap(8, 4)).toBe(2);
    expect(perProcessDailyCap(2, 4)).toBe(0);
  });

  it('counts days left including today, including month ends and leap day', () => {
    expect(utcMonthParts(Date.UTC(2026, 9, 1))).toMatchObject({ daysInMonth: 31, daysLeft: 31, day: '2026-10-01' });
    expect(utcMonthParts(OCT31)).toMatchObject({ daysInMonth: 31, daysLeft: 1, day: '2026-10-31' });
    expect(utcMonthParts(Date.UTC(2026, 10, 1, 0, 0, 1))).toMatchObject({ daysInMonth: 30, daysLeft: 30, day: '2026-11-01' });
    expect(utcMonthParts(Date.UTC(2026, 1, 1))).toMatchObject({ daysInMonth: 28, daysLeft: 28, day: '2026-02-01' });
    expect(utcMonthParts(Date.UTC(2026, 1, 28, 23, 59))).toMatchObject({ daysInMonth: 28, daysLeft: 1, day: '2026-02-28' });
    expect(utcMonthParts(Date.UTC(2028, 1, 29, 23, 59))).toMatchObject({ daysInMonth: 29, daysLeft: 1, day: '2028-02-29' });
    expect(utcMonthParts(Date.UTC(2025, 11, 31, 23, 59))).toMatchObject({ daysInMonth: 31, daysLeft: 1, day: '2025-12-31' });
    expect(utcMonthParts(Date.UTC(2026, 0, 1))).toMatchObject({ daysInMonth: 31, daysLeft: 31, day: '2026-01-01' });
  });

  it('keeps used-at-start fixed for the UTC day and recomputes on the next day', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 1_000);
    const first = await planDailyCap(OCT31);
    expect(first).toMatchObject({ mode: 'paced', usedAtStart: 1_000, day: '2026-10-31' });
    expect(first.cap).toBe(pacedDailyCap(500_000, 80, 1_000, 1));

    const later = OCT31 + 60_000;
    seedKey(redis, later, 8_000);
    vi.setSystemTime(later);
    const sameDay = await planDailyCap(later);
    expect(sameDay.usedAtStart).toBe(1_000);
    expect(sameDay.cap).toBe(first.cap);

    const nov1 = Date.UTC(2026, 10, 1, 0, 0, 1);
    seedKey(redis, nov1, 8_000);
    vi.setSystemTime(nov1);
    const nextMonth = await planDailyCap(nov1);
    expect(nextMonth).toMatchObject({ mode: 'paced', usedAtStart: 8_000, day: '2026-11-01' });
    expect(nextMonth.cap).toBe(pacedDailyCap(500_000, 80, 8_000, 30));
  });

  it('falls back to the flat share when /key is unavailable', async () => {
    holder.redis = makeRedis();
    const plan = await planDailyCap(OCT31);
    expect(plan.mode).toBe('flat');
    expect(plan.cap).toBe(flatDailyCap(500_000, 80, 31));
    expect(plan.usedAtStart).toBeNull();
  });
});

describe('cgFetch gate', () => {
  it('refuses at the cap and does not fetch', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    vi.stubEnv('CG_MONTHLY_CREDITS', '100');
    seedKey(redis, OCT31, 79, 100);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.mock.calls).toEqual([['CG_MONTHLY_CAP']]);
  });

  it('returns a fresh cached response and logs only the code', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    vi.stubEnv('CG_MONTHLY_CREDITS', '100');
    seedKey(redis, OCT31, 79, 100);
    const fetchMock = vi.fn(async () => priceResponse(7));
    vi.stubGlobal('fetch', fetchMock);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const first = await getSimplePrices(['bitcoin']);
    expect(first?.bitcoin.usd).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await getSimplePrices(['bitcoin']);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.mock.calls).toEqual([['CG_MONTHLY_CAP']]);

    vi.setSystemTime(OCT31 + 31_000);
    expect(await getSimplePrices(['bitcoin'])).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some((call) => String(call[0]).includes('bitcoin'))).toBe(false);
  });

  it('logs counts only, once every five minutes', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    vi.stubEnv('CG_MONTHLY_CREDITS', '100');
    seedKey(redis, OCT31, 0, 100);
    vi.stubGlobal('fetch', vi.fn(async () => priceResponse()));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await getSimplePrices(['bitcoin'], { noStore: true });
    expect(log.mock.calls.filter((call) => String(call[0]).includes('calls_today'))).toHaveLength(0);

    vi.setSystemTime(OCT31 + 5 * 60_000 + 1);
    await getSimplePrices(['bitcoin'], { noStore: true });
    const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[CoinGecko] budget'));
    expect(lines).toEqual([expect.stringMatching(/^\[CoinGecko\] budget calls_today=\d+ cap=\d+ refused=\d+$/)]);
  });

  it('uses an in-process counter at the flat cap divided by the process estimate when Redis is down', async () => {
    holder.redis = null;
    vi.stubEnv('CG_MONTHLY_CREDITS', '78');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    vi.stubEnv('CG_TARGET_PCT', '80');
    expect(perProcessDailyCap(flatDailyCap(78, 80, 31), 1)).toBe(2);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect((await getSimplePrices(['ethereum'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(await getSimplePrices(['solana'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not open a second in-process budget after Redis was already counting today', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    vi.stubEnv('CG_MONTHLY_CREDITS', '100');
    seedKey(redis, OCT31, 0, 100);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    redis.incr = async () => { throw new Error('redis down'); };
    expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports plan, quota, used, remaining, the 80% target, and today on the admin readout', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 1_000);
    const fetchKey = vi.fn(async () => { throw new Error('cached snapshot should be reused'); });
    const status = await cgBudgetStatus(fetchKey, OCT31);
    expect(fetchKey).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      plan: 'Analyst',
      quota: 500_000,
      used: 1_000,
      remaining: 499_000,
      targetPct: 80,
      targetCredits: 400_000,
      todayCap: pacedDailyCap(500_000, 80, 1_000, 1),
      callsToday: 0,
      refusedToday: 0,
      capMode: 'paced',
    });
    const route = readFileSync('app/api/admin/cg-usage/route.ts', 'utf8');
    expect(route).toContain('requireAdmin');
    expect(route).toContain('cgBudgetStatus');
    expect(route).toContain('todayCap');
    expect(route).toContain('refusedToday');
    const panel = readFileSync('components/admin/CryptoMarketData.tsx', 'utf8');
    expect(panel).toContain('Hard cap');
    expect(panel).toContain('b.refusedToday');
  });
});

describe('no CoinGecko fetch outside cgFetch', () => {
  it('fails if a CoinGecko API URL is fetched outside lib/coingecko.ts', () => {
    const allow = new Set(['lib/coingecko.ts', 'next.config.mjs']);
    const offenders: string[] = [];
    const files = walk(process.cwd());
    for (const file of files) {
      const rel = relative(process.cwd(), file).split('\\').join('/');
      if (allow.has(rel)) continue;
      const stripped = stripComments(readFileSync(file, 'utf8'));
      if (/pro-api\.coingecko\.com|api\.coingecko\.com/.test(stripped)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    const wrapper = readFileSync('lib/coingecko.ts', 'utf8');
    expect(wrapper.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(wrapper).toContain('await reserveCgCall()');
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(path);
  }
  return out;
}
