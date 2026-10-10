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
  eval?: (script: string, keys: string[], args: Array<string | number>) => Promise<unknown>;
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
    async eval(script, keys, args) {
      const { applyCgLedger } = await import('@/lib/admin/cgDailyCap');
      if (!script.includes("'cg'") && !script.includes('cjson.decode')) return [0, 0, 0];
      return applyCgLedger(store, keys, args);
    },
  };
}

vi.mock('@/lib/redis', () => ({
  getRedis: () => holder.redis,
  getLimiterRedis: () => holder.redis,
}));

import { getMarketChartRange, getMarketData, getSimplePrices, resetCgResponseCacheForTests } from '@/lib/coingecko';
import { runWithAvBudget } from '@/lib/avLimiter';
import {
  CG_LIMITER_REDIS_TIMEOUT_MS,
  cgDailyHardMax,
  cgDuty,
  cgQuota,
  cgTargetPct,
  clampDailyCap,
  conservativeProcessShare,
  flatDailyCap,
  ledgerHardMax,
  pacedDailyCap,
  shelfShareFor,
  perProcessDailyCap,
  planDailyCap,
  resetCgCapStateForTests,
  setCgShelfForTests,
  utcMonthParts,
  CG_REDIS_PREFIX,
} from '@/lib/admin/cgDailyCap';
import { CG_CALLER_REDIS_PREFIX, cgEndpointName, formatCgCallerCounts, readCgCallerCounts, resetCgCallerCountsForTests, runWithCgCaller } from '@/lib/admin/cgCallers';
import { cgBudgetStatus } from '@/lib/admin/cgCredits';
import { CG_BYPASS_FIXTURES, evalRunsCapScript, isCgCapScript } from './helpers/cgEvalGuard';

const OCT31 = Date.UTC(2026, 9, 31, 12, 0, 0);

function seedKey(redis: FakeRedis, now: number, used: number, quota = 500_000) {
  redis.store.set('admin:cg-credits:v1:key', {
    at: new Date(now).toISOString(),
    atMs: now,
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

function makeShelf() {
  const rows = new Map<string, { spent: number; timeouts: number }>();
  const shelf = {
    rows,
    charges: 0,
    async chargeWeb(day: string, limit: number, timeoutInc: number) {
      shelf.charges += 1;
      if (!(limit > 0)) return 'exhausted' as const;
      const key = `${day}:web`;
      const row = rows.get(key) ?? { spent: 0, timeouts: 0 };
      if (row.spent >= limit) return 'exhausted' as const;
      row.spent += 1;
      row.timeouts += timeoutInc;
      rows.set(key, row);
      return 'admitted' as const;
    },
    async noteTimeout(day: string, role: 'web' | 'worker' | 'jarvis') {
      const key = `${day}:${role}`;
      const row = rows.get(key) ?? { spent: 0, timeouts: 0 };
      row.timeouts += 1;
      rows.set(key, row);
    },
    async read(day: string) {
      const spent = { web: 0, worker: 0, jarvis: 0 };
      let timeouts = 0;
      for (const role of ['web', 'worker', 'jarvis'] as const) {
        const row = rows.get(`${day}:${role}`);
        if (!row) continue;
        spent[role] = row.spent;
        timeouts += row.timeouts;
      }
      return { spent, timeouts };
    },
  };
  return shelf;
}

beforeEach(() => {
  holder.redis = makeRedis();
  resetCgCapStateForTests();
  resetCgCallerCountsForTests();
  resetCgResponseCacheForTests();
  setCgShelfForTests(makeShelf());
  vi.stubEnv('CG_MONTHLY_CREDITS', '500000');
  vi.stubEnv('CG_TARGET_PCT', '80');
  vi.stubEnv('CG_ESTIMATED_PROCESSES', '4');
  vi.stubEnv('COINGECKO_API_KEY', 'CG-test');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCT31);
});

afterEach(() => {
  setCgShelfForTests(null);
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
    expect(clampDailyCap(pacedDailyCap(500_000, 80, 100_000, 10))).toBe(16_500);
    expect(pacedDailyCap(500_000, 80, 400_000, 10)).toBe(0);
    expect(pacedDailyCap(500_000, 80, 399_999, 1)).toBe(1);
    expect(perProcessDailyCap(8, 4)).toBe(2);
    expect(perProcessDailyCap(2, 4)).toBe(0);
    const october = clampDailyCap(flatDailyCap(500_000, 80, 31));
    const february = clampDailyCap(flatDailyCap(500_000, 80, 28));
    expect(october).toBe(12_903);
    const octoberShare = conservativeProcessShare(october, 4);
    const februaryShare = conservativeProcessShare(february, 4);
    expect(octoberShare).toBe(806);
    expect(october + octoberShare).toBe(13_709);
    expect(february).toBe(14_285);
    expect(february + februaryShare).toBe(15_177);
    expect(ledgerHardMax(16_500, octoberShare) + octoberShare).toBe(16_500);
    expect(ledgerHardMax(16_500, februaryShare) + februaryShare).toBe(16_500);
    expect(ledgerHardMax(16_500, octoberShare) + octoberShare).toBeLessThanOrEqual(16_500);
    expect(ledgerHardMax(16_500, februaryShare) + februaryShare).toBeLessThanOrEqual(16_500);
    expect(conservativeProcessShare(8, 4)).toBe(0);
    expect(conservativeProcessShare(8, 1)).toBe(2);
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
    expect(pacedDailyCap(500_000, 80, 1_000, 1)).toBe(399_000);
    expect(first.cap).toBe(ledgerHardMax(16_500, shelfShareFor(process.env, 31)));

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

  it('clamps a paced budget above 16500 to 16500, including a ledger sealed higher', async () => {
    expect(cgDailyHardMax({})).toBe(16_500);
    expect(clampDailyCap(pacedDailyCap(500_000, 80, 100_000, 10))).toBe(16_500);
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 1_000);
    const sealed = await planDailyCap(OCT31);
    expect(pacedDailyCap(500_000, 80, 1_000, 1)).toBe(399_000);
    const ceiling = ledgerHardMax(16_500, shelfShareFor(process.env, 31));
    expect(ceiling + shelfShareFor(process.env, 31)).toBeLessThanOrEqual(16_500);
    expect(sealed.cap).toBe(ceiling);

    const ledger = redis.store.get('admin:cg-credits:v1:ledger:2026-10-31') as { cap: number };
    ledger.cap = 30_000;
    const lowered = await planDailyCap(OCT31);
    expect(lowered.cap).toBe(ceiling);
    expect(lowered.usedAtStart).toBe(1_000);
    expect((redis.store.get('admin:cg-credits:v1:ledger:2026-10-31') as { cap: number }).cap).toBe(ceiling);
  });

  it('uses a CG_DAILY_HARD_MAX override for the sealed cap and the shelf', async () => {
    expect(cgDailyHardMax({ CG_DAILY_HARD_MAX: '1000' })).toBe(1_000);
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 1_000);
    vi.stubEnv('CG_DAILY_HARD_MAX', '1000');
    const plan = await planDailyCap(OCT31);
    expect(plan.cap).toBe(ledgerHardMax(1_000, shelfShareFor(process.env, 31)));
    expect(plan.cap + shelfShareFor(process.env, 31)).toBeLessThanOrEqual(1_000);
    expect(plan.usedAtStart).toBe(1_000);

    holder.redis = null;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    vi.stubEnv('CG_DAILY_HARD_MAX', '8');
    const flat = flatDailyCap(500_000, 80, 31);
    expect(flat).toBeGreaterThan(8);
    expect(conservativeProcessShare(flat, 1)).toBeGreaterThan(2);
    expect(conservativeProcessShare(clampDailyCap(flat, 8), 1)).toBe(2);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect((await getSimplePrices(['ethereum'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(await getSimplePrices(['solana'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shelf.rows.get('2026-10-31:web')?.spent).toBe(2);
  });

  it('records the caller and the endpoint for each attempt', async () => {
    expect(CG_CALLER_REDIS_PREFIX).toBe(CG_REDIS_PREFIX);
    expect(cgEndpointName('/simple/price')).toBe('simple/price');
    expect(cgEndpointName('/coins/markets')).toBe('coins/markets');
    expect(cgEndpointName('/coins/bitcoin/market_chart')).toBe('market_chart');
    expect(cgEndpointName('/coins/bitcoin/market_chart/range')).toBe('market_chart/range');
    expect(cgEndpointName('/coins/bitcoin/ohlc/range')).toBe('ohlc/range');
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 0);
    vi.stubGlobal('fetch', vi.fn(async () => priceResponse()));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithCgCaller('arca-cycle:history', () => getSimplePrices(['bitcoin'], { noStore: true }));
    const counts = await readCgCallerCounts(OCT31);
    expect(counts).toEqual({ 'arca-cycle:history': { 'simple/price': 1 } });
    expect(formatCgCallerCounts(counts)).toBe('arca-cycle:history|simple/price=1');
  });

  it('falls back to 16500 when CG_DAILY_HARD_MAX is not a positive number', async () => {
    expect(cgDailyHardMax({ CG_DAILY_HARD_MAX: 'nope' })).toBe(16_500);
    expect(cgDailyHardMax({ CG_DAILY_HARD_MAX: '0' })).toBe(16_500);
    expect(cgDailyHardMax({ CG_DAILY_HARD_MAX: '-5' })).toBe(16_500);
    expect(cgDailyHardMax({ CG_DAILY_HARD_MAX: '' })).toBe(16_500);
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 1_000);
    vi.stubEnv('CG_DAILY_HARD_MAX', 'nope');
    const plan = await planDailyCap(OCT31);
    expect(pacedDailyCap(500_000, 80, 1_000, 1)).toBe(399_000);
    const ceiling = ledgerHardMax(16_500, shelfShareFor(process.env, 31));
    expect(plan.cap).toBe(ceiling);
    expect(plan.cap + shelfShareFor(process.env, 31)).toBeLessThanOrEqual(16_500);
  });

  it('drops caller tallies from older UTC days', async () => {
    const yesterday = Date.UTC(2026, 9, 30, 12);
    const { rememberCgCaller } = await import('@/lib/admin/cgCallers');
    rememberCgCaller('scanner-run', 'ohlc/range', yesterday);
    rememberCgCaller('scanner-run', 'market_chart/range', OCT31);
    expect(await readCgCallerCounts(yesterday)).toEqual({});
    expect(await readCgCallerCounts(OCT31)).toEqual({ 'scanner-run': { 'market_chart/range': 1 } });
  });
});

describe('cgFetch gate', () => {
  it('serves a 24h history body without a second reserve, and still fetches the quote snapshot', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 0);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ prices: [[OCT31, 1]], market_caps: [[OCT31, 2]], total_volumes: [[OCT31, 3]] }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const from = Math.floor(OCT31 / 1000) - 7 * 86_400;
    const to = Math.floor(OCT31 / 1000);
    await getMarketChartRange('bitcoin', from, to, { retries: 1, cacheSeconds: 86_400 });
    await getMarketChartRange('bitcoin', from, to, { retries: 1, cacheSeconds: 86_400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ledger = redis.store.get('admin:cg-credits:v1:ledger:2026-10-31') as { issued: number };
    expect(ledger.issued).toBe(1);

    fetchMock.mockClear();
    await getMarketData({ ids: ['bitcoin'], per_page: 1, sparkline: false });
    await getMarketData({ ids: ['bitcoin'], per_page: 1, sparkline: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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

  it('uses the shared shelf at the conservative share when Redis is down', async () => {
    holder.redis = null;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('CG_MONTHLY_CREDITS', '310');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    vi.stubEnv('CG_TARGET_PCT', '80');
    const flat = flatDailyCap(310, 80, 31);
    expect(perProcessDailyCap(flat, 1)).toBe(8);
    expect(conservativeProcessShare(flat, 1)).toBe(2);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect((await getSimplePrices(['ethereum'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(await getSimplePrices(['solana'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shelf.rows.get('2026-10-31:web')?.spent).toBe(2);
  });

  it('uses the conservative shelf when Redis errors', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('CG_MONTHLY_CREDITS', '310');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    redis.eval = async () => { throw new Error('redis down'); };
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect((await getSimplePrices(['ethereum'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(await getSimplePrices(['solana'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((call) => String(call[0])).some((line) => line.startsWith('[CoinGecko] fallback timeout=0 error='))).toBe(true);
  });

  it('a Redis timeout spends the conservative shelf and does not grant the old per-process cap', async () => {
    expect(CG_LIMITER_REDIS_TIMEOUT_MS).toBe(400);
    const redis = makeRedis();
    holder.redis = redis;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('CG_MONTHLY_CREDITS', '310');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    expect(conservativeProcessShare(flatDailyCap(310, 80, 31), 1)).toBe(2);
    redis.eval = () => new Promise(() => {});
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect((await getSimplePrices(['ethereum'], { noStore: true }))?.bitcoin.usd).toBe(42);
    expect(await getSimplePrices(['solana'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shelf.rows.get('2026-10-31:web')?.timeouts).toBe(1);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(/\[CoinGecko\] fallback timeout=1 error=0 absent=0 cap=/);
  });

  it('a cron fails closed when the global reservation is not confirmed', async () => {
    holder.redis = null;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('AV_PROCESS_ROLE', 'jarvis');
    expect(cgDuty({ AV_PROCESS_ROLE: 'jarvis' })).toBe('job');
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shelf.charges).toBe(0);

    vi.stubEnv('AV_PROCESS_ROLE', '');
    holder.redis = makeRedis();
    holder.redis.eval = () => new Promise(() => {});
    await runWithAvBudget({ lane: 'scheduled', feature: 'cron-test' }, async () => {
      expect(cgDuty()).toBe('job');
      expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shelf.charges).toBe(0);
    expect(shelf.rows.get('2026-10-31:web')?.timeouts).toBe(1);
  });

  it('does not mint a new shelf share after a simulated restart', async () => {
    holder.redis = null;
    const shelf = makeShelf();
    setCgShelfForTests(shelf);
    vi.stubEnv('CG_MONTHLY_CREDITS', '160');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    expect(conservativeProcessShare(flatDailyCap(160, 80, 31), 1)).toBe(1);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    resetCgCapStateForTests();
    setCgShelfForTests(shelf);
    expect(await getSimplePrices(['ethereum'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shelf.rows.get('2026-10-31:web')?.spent).toBe(1);

    const redis = makeRedis();
    holder.redis = redis;
    vi.stubEnv('CG_MONTHLY_CREDITS', '100');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '4');
    seedKey(redis, OCT31, 79, 100);
    resetCgCapStateForTests();
    setCgShelfForTests(shelf);
    expect((await getSimplePrices(['bitcoin'], { noStore: true }))?.bitcoin.usd).toBe(42);
    resetCgCapStateForTests();
    setCgShelfForTests(shelf);
    expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs the same totals once an hour', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    seedKey(redis, OCT31, 0);
    vi.stubGlobal('fetch', vi.fn(async () => priceResponse()));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await getSimplePrices(['bitcoin'], { noStore: true });
    expect(log.mock.calls.map((call) => String(call[0])).some((line) => line.startsWith('[CoinGecko] daily '))).toBe(false);

    vi.setSystemTime(OCT31 + 60 * 60 * 1000 + 1);
    await getSimplePrices(['ethereum'], { noStore: true });
    const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[CoinGecko] daily '));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[CoinGecko\] daily reserved=\d+ cap=\d+ fallback web=\d+ worker=\d+ jarvis=\d+ timeouts=\d+ callers=/);
    expect(lines[0]).toContain('callers=unknown|simple/price=1');
  });

  it('does not treat a foreign eval tuple as the cap decision', async () => {
    const redis = makeRedis();
    holder.redis = redis;
    const foreign = async (_script: string, keys: string[], args: number[]) => {
      const own = Number(redis.store.get(keys[0]) ?? 0);
      const shadow = 0;
      const n = args[0];
      if (own + n > 1500 || shadow + n > 4500) return [0, own, 0];
      return [1, own + n, 0];
    };
    expect(evalRunsCapScript(foreign)).toBe(false);
    expect(isCgCapScript("redis.call('INCR', KEYS[1])\nreturn {'cg', 1, n, refused}")).toBe(true);
    redis.eval = foreign as FakeRedis['eval'];
    vi.stubEnv('CG_MONTHLY_CREDITS', '78');
    vi.stubEnv('CG_ESTIMATED_PROCESSES', '1');
    expect(conservativeProcessShare(flatDailyCap(78, 80, 31), 1)).toBe(0);
    const fetchMock = vi.fn(async () => priceResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await getSimplePrices(['bitcoin'], { noStore: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFileSync('lib/admin/cgDailyCap.ts', 'utf8')).not.toContain('evalRunsCapScript');
    expect(isCgCapScript(readFileSync('lib/admin/cgDailyCap.ts', 'utf8'))).toBe(true);
    const source = readFileSync('lib/admin/cgDailyCap.ts', 'utf8');
    expect(source).toContain('math.floor((quota * (targetPct / 100) - (used or 0)) / daysLeft)');
    expect(source).toContain('local hardMax = n(ARGV[9]) or 0');
    expect(source).toContain('if hardMax > 0 and cap > hardMax then cap = math.floor(hardMax) end');
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
      todayCap: ledgerHardMax(16_500, shelfShareFor(process.env, 31)),
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
  it('fails if a CoinGecko API URL or COINGECKO env read is assembled outside lib/coingecko.ts', () => {
    for (const [sample, hit] of CG_BYPASS_FIXTURES.hosts) expect(hostsIn(sample)).toBe(hit);
    for (const [sample, hit] of CG_BYPASS_FIXTURES.env) expect(envReadIn(sample)).toBe(hit);

    const hostAllow = new Set(['lib/coingecko.ts', 'next.config.mjs', 'test/helpers/cgEvalGuard.ts']);
    const envAllow = new Set(['lib/coingecko.ts', 'test/coingeckoKeyAndCredit.test.ts', 'test/helpers/cgEvalGuard.ts']);
    const hostOffenders: string[] = [];
    const envOffenders: string[] = [];
    for (const file of walk(process.cwd())) {
      const rel = relative(process.cwd(), file).split('\\').join('/');
      const source = readFileSync(file, 'utf8');
      if (!hostAllow.has(rel) && hostsIn(source)) hostOffenders.push(rel);
      if (!envAllow.has(rel) && envReadIn(source)) envOffenders.push(rel);
    }
    expect(hostOffenders).toEqual([]);
    expect(envOffenders).toEqual([]);
    const wrapper = readFileSync('lib/coingecko.ts', 'utf8');
    expect(wrapper.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(wrapper).toContain('await reserveCgCall()');
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Join string concat and template literal pieces so a split host is still visible. */
function collapseAssemblies(source: string): string {
  let text = stripComments(source);
  let prev = '';
  while (text !== prev) {
    prev = text;
    text = text.replace(/(['"`])([^'"`\\]*)\1\s*\+\s*(['"`])([^'"`\\]*)\3/g, '$1$2$4$1');
    text = text.replace(/\$\{\s*(['"`])([^'"`\\]*)\1\s*\}/g, '$2');
  }
  return text;
}

function hostsIn(source: string): boolean {
  return /pro-api\.coingecko\.com|(?<![\w-])api\.coingecko\.com/.test(collapseAssemblies(source));
}

function envReadIn(source: string): boolean {
  return /process\.env\s*(?:\??\.\s*COINGECKO[A-Z0-9_]*|\[\s*['"`]COINGECKO[A-Z0-9_]*)/.test(collapseAssemblies(source));
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
