import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisHarness = vi.hoisted(() => {
  const evalFn = vi.fn();
  return {
    evalFn,
    mode: { value: 'off' as 'off' | 'on' },
  };
});

vi.mock('@/lib/redis', () => ({
  getRedis: () => null,
  getLimiterRedis: () => (redisHarness.mode.value === 'on' ? { eval: redisHarness.evalFn } : null),
  LIMITER_REDIS_TIMEOUT_MS: 400,
}));

import {
  AV_540_CEILING_PER_MIN,
  AV_540_FALLBACK_PER_MIN,
  AV_ALLOWANCE_SUM,
  AV_CEILING_PER_MIN,
  AV_FALLBACK_LOG_EVERY_MS,
  AV_JARVIS_FALLBACK_PER_MIN,
  AV_JARVIS_FEATURE,
  AV_LANES,
  AV_LANE_RESERVE,
  AV_LICENCE_PER_MIN,
  AV_LIMITER_LUA,
  AV_LIMITER_REDIS_TIMEOUT_MS,
  AV_WEB_FALLBACK_PER_MIN,
  AV_WORKER_FALLBACK_PER_MIN,
  AV_WORKER_FEATURE,
  applyAvBudgetForTests,
  applyAvProcessRoleForTests,
  avBudgetPlanForMode,
  avTryTake,
  decideAvTake,
  fallbackBudget,
  type AvLane,
  flushAvFeatureCounts,
  jarvisSharedFloor,
  normalizeBudget,
  noteAvFeatureCall,
  readAvBudgetMode,
  refuseIllegalAvBudget,
  reservesForCeiling,
  resetAvLimiterLocalForTests,
} from '@/lib/avLimiter';

/** Same steps as AV_LIMITER_LUA: owed minimums, user borrow of idle alerts/scheduled, deny when total + 1 + mustLeave > ceiling. */
function luaWouldGrant(input: {
  rows: string[];
  lane: string;
  ceiling: number;
  reserves: Record<string, number>;
  order: readonly string[];
}): boolean {
  const used: Record<string, number> = {};
  for (const name of input.order) used[name] = 0;
  const total = input.rows.length;
  for (const member of input.rows) {
    const lane = /^\d+:[^:]+:([^:]+):/.exec(member)?.[1];
    if (lane && used[lane] != null) used[lane] += 1;
  }
  const unused: Record<string, number> = {};
  for (const name of input.order) unused[name] = Math.max(0, (input.reserves[name] || 0) - (used[name] || 0));
  let borrowed = Math.max(0, (used.user || 0) - (input.reserves.user || 0));
  for (const name of ['scheduled', 'alerts']) {
    if ((used[name] || 0) === 0) {
      const take = Math.min(unused[name] || 0, borrowed);
      unused[name] -= take;
      borrowed -= take;
    }
  }
  let mustLeave = 0;
  for (const name of input.order) {
    if (name === input.lane) continue;
    const userBorrowsIdle = input.lane === 'user' && (name === 'alerts' || name === 'scheduled') && (used[name] || 0) === 0;
    if (!userBorrowsIdle) mustLeave += unused[name] || 0;
  }
  return total + 1 + mustLeave <= input.ceiling;
}

function takesFrom(lane: AvLane, start: Partial<Record<AvLane, number>>, ceiling?: number, reserve?: Record<AvLane, number>): number {
  const usedByLane: Record<AvLane, number> = { user: 0, alerts: 0, scheduled: 0, backfill: 0, ...start };
  let total = AV_LANES.reduce((sum, name) => sum + usedByLane[name], 0);
  let n = 0;
  while (decideAvTake({ lane, usedTotal: total, usedByLane, ceiling, reserve }).allow) {
    usedByLane[lane] += 1;
    total += 1;
    n += 1;
    if (n > 1000) break;
  }
  return n;
}

describe('shared AV limiter', () => {
  beforeEach(() => {
    flushAvFeatureCounts();
    resetAvLimiterLocalForTests();
    applyAvBudgetForTests({ AV_BUDGET_MODE: 'split' });
    applyAvProcessRoleForTests(null);
    redisHarness.mode.value = 'off';
    redisHarness.evalFn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the fallbacks in both modes and refuses 540 + 61', () => {
    const split = avBudgetPlanForMode('split');
    expect(AV_CEILING_PER_MIN).toBe(300);
    expect(split.reserves).toEqual({ user: 50, alerts: 30, scheduled: 100, backfill: 120 });
    expect(split.jarvisFloor).toBe(120);
    expect(split.webFallback).toBe(80);
    expect(split.workerFallback).toBe(100);
    expect(split.jarvisFallback).toBe(120);
    expect(split.worstCase).toBe(300 + 80 + 100 + 120);
    expect(split.worstCase).toBe(600);
    expect(AV_ALLOWANCE_SUM).toBe(AV_LICENCE_PER_MIN);
    expect(AV_LANES.reduce((sum, lane) => sum + AV_LANE_RESERVE[lane], 0)).toBe(300);
    expect(jarvisSharedFloor(split.ceiling, split.reserves)).toBe(AV_JARVIS_FALLBACK_PER_MIN);
    const wide = avBudgetPlanForMode('540');
    expect(wide.ceiling).toBe(AV_540_CEILING_PER_MIN);
    expect(wide.reserves).toEqual({ user: 90, alerts: 54, scheduled: 180, backfill: 216 });
    expect(wide.jarvisFloor).toBe(216);
    expect(wide.webFallback).toBe(AV_540_FALLBACK_PER_MIN);
    expect(wide.workerFallback).toBe(20);
    expect(wide.jarvisFallback).toBe(20);
    expect(wide.worstCase).toBe(540 + 20 + 20 + 20);
    expect(wide.worstCase).toBe(600);
    expect(AV_LANES.reduce((sum, lane) => sum + reservesForCeiling(AV_WEB_FALLBACK_PER_MIN)[lane], 0)).toBe(AV_WEB_FALLBACK_PER_MIN);
    expect(reservesForCeiling(20, wide.reserves, wide.ceiling)).toEqual({ user: 3, alerts: 2, scheduled: 7, backfill: 8 });
    expect(() => readAvBudgetMode({ AV_BUDGET_MODE: 'wide' } as NodeJS.ProcessEnv)).toThrow(/AV_BUDGET_MODE=wide/);
    expect(() => refuseIllegalAvBudget({ ...split, worstCase: 601 })).toThrow(/AV_BUDGET_MODE=split/);
    expect(() => refuseIllegalAvBudget({ ...wide, webFallback: 21 })).toThrow(/AV_BUDGET_MODE=540/);
    expect(() => refuseIllegalAvBudget({ ...wide, webFallback: 21 })).toThrow(/601/);
    expect(() => applyAvBudgetForTests({ AV_BUDGET_MODE: '540' })).not.toThrow();
    expect(fallbackBudget('web')).toEqual({
      ceiling: 20,
      reserve: { user: 3, alerts: 2, scheduled: 7, backfill: 8 },
    });
    expect(fallbackBudget('worker')).toEqual({
      ceiling: 20,
      reserve: { user: 0, alerts: 0, scheduled: 20, backfill: 0 },
    });
    expect(fallbackBudget('jarvis')).toEqual({
      ceiling: 20,
      reserve: { user: 0, alerts: 0, scheduled: 0, backfill: 20 },
    });
    expect(() => refuseIllegalAvBudget({ ...wide, jarvisFallback: 1 })).not.toThrow();
    expect(() => refuseIllegalAvBudget({ ...wide, jarvisFloor: 119 })).toThrow(/AV_BUDGET_MODE=540/);
    applyAvBudgetForTests({ AV_BUDGET_MODE: 'split' });
  });

  it('treats reserves as minimums the user can borrow past, without giving away the other floors', () => {
    const idle = { user: 50, alerts: 0, scheduled: 0, backfill: 0 };
    expect(decideAvTake({ lane: 'user', usedTotal: 50, usedByLane: idle }).allow).toBe(true);
    expect(takesFrom('user', idle)).toBe(130);
    expect(decideAvTake({ lane: 'user', usedTotal: 180, usedByLane: { user: 180, alerts: 0, scheduled: 0, backfill: 0 } }).allow).toBe(false);

    const userLoad = { user: 180, alerts: 0, scheduled: 0, backfill: 0 };
    expect(takesFrom('backfill', userLoad)).toBe(120);
    expect(decideAvTake({ lane: 'user', usedTotal: 180, usedByLane: userLoad }).allow).toBe(false);

    const fair = { user: 50, alerts: 0, scheduled: 0, backfill: 0 };
    expect(takesFrom('alerts', fair)).toBe(30);
    expect(takesFrom('scheduled', fair)).toBe(100);
    expect(takesFrom('backfill', fair)).toBe(120);

    const scheduledStarted = { user: 50, alerts: 0, scheduled: 1, backfill: 0 };
    expect(takesFrom('scheduled', scheduledStarted)).toBe(99);
    expect(takesFrom('user', scheduledStarted)).toBeLessThan(130);
  });

  it('lets a user take a token when backfill has used its 120 floor', () => {
    const usedByLane = { user: 0, alerts: 0, scheduled: 0, backfill: 120 };
    expect(decideAvTake({ lane: 'backfill', usedTotal: 119, usedByLane: { ...usedByLane, backfill: 119 } }).allow).toBe(true);
    expect(decideAvTake({ lane: 'backfill', usedTotal: 120, usedByLane }).allow).toBe(false);
    expect(decideAvTake({ lane: 'user', usedTotal: 120, usedByLane }).allow).toBe(true);
    const wide = avBudgetPlanForMode('540');
    expect(decideAvTake({ lane: 'backfill', usedTotal: 215, usedByLane: {}, ceiling: wide.ceiling, reserve: wide.reserves }).allow).toBe(true);
    expect(decideAvTake({ lane: 'backfill', usedTotal: 216, usedByLane: {}, ceiling: wide.ceiling, reserve: wide.reserves }).allow).toBe(false);
  });

  it('denies every lane once the shared minute is full', () => {
    const usedByLane = { user: AV_CEILING_PER_MIN, alerts: 0, scheduled: 0, backfill: 0 };
    for (const lane of AV_LANES) {
      expect(decideAvTake({ lane, usedTotal: AV_CEILING_PER_MIN, usedByLane }).allow).toBe(false);
    }
  });

  it('defaults an untagged call to the user lane', () => {
    expect(normalizeBudget().lane).toBe('user');
    expect(normalizeBudget({ feature: 'page' }).lane).toBe('user');
    expect(normalizeBudget({ lane: 'scheduled', feature: 'daily-scan' }).lane).toBe('scheduled');
  });

  it('picks the fallback from the process, not the feature name', async () => {
    const t = 40_000_000;
    let postedAsJarvis = 0;
    for (let i = 0; i < 130; i += 1) {
      if (await avTryTake({ lane: 'backfill', feature: AV_JARVIS_FEATURE }, t + i)) postedAsJarvis += 1;
    }
    expect(postedAsJarvis).toBe(reservesForCeiling(AV_WEB_FALLBACK_PER_MIN).backfill);
    expect(postedAsJarvis).toBeLessThan(AV_JARVIS_FALLBACK_PER_MIN);

    resetAvLimiterLocalForTests();
    applyAvProcessRoleForTests('jarvis');
    const jarvisAt = 45_000_000;
    let jarvis = 0;
    for (let i = 0; i < 130; i += 1) {
      if (await avTryTake({ lane: 'backfill', feature: 'something-else' }, jarvisAt + i)) jarvis += 1;
    }
    expect(jarvis).toBe(AV_JARVIS_FALLBACK_PER_MIN);
    expect(fallbackBudget().ceiling).toBe(120);

    resetAvLimiterLocalForTests();
    applyAvProcessRoleForTests('worker');
    const workerAt = 60_000_000;
    let worker = 0;
    for (let i = 0; i < 110; i += 1) {
      if (await avTryTake({ lane: 'scheduled', feature: AV_WORKER_FEATURE }, workerAt + i)) worker += 1;
    }
    expect(worker).toBe(AV_WORKER_FALLBACK_PER_MIN);
    expect(await avTryTake({ lane: 'backfill', feature: AV_JARVIS_FEATURE }, workerAt + 111)).toBe(false);

    resetAvLimiterLocalForTests();
    applyAvProcessRoleForTests(null);
    const webAt = 50_000_000;
    let web = 0;
    for (let i = 0; i < 90; i += 1) {
      if (await avTryTake({ lane: 'user', feature: 'page' }, webAt + i)) web += 1;
    }
    const webSplit = reservesForCeiling(AV_WEB_FALLBACK_PER_MIN);
    expect(web).toBe(AV_WEB_FALLBACK_PER_MIN - webSplit.backfill);
    expect(web).toBeGreaterThan(webSplit.user);
    expect(fallbackBudget('web').ceiling).toBe(AV_WEB_FALLBACK_PER_MIN);
  });

  it('logs the fallback warning once per five minutes, not once per call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = 70_000_000;
    await avTryTake({ lane: 'scheduled', feature: 'page' }, t);
    await avTryTake({ lane: 'scheduled', feature: 'page' }, t + 1_000);
    const fallbacks = () => warn.mock.calls.filter((call) => String(call[0]).includes('fallback rate'));
    expect(fallbacks()).toHaveLength(1);
    expect(String(fallbacks()[0][0])).toContain('absent=1');
    expect(String(fallbacks()[0][0])).toContain('cap=80');
    expect(String(fallbacks()[0][0])).toContain('role=web');
    expect(String(fallbacks()[0][0])).not.toMatch(/ECONN|http|token/i);
    await avTryTake({ lane: 'scheduled', feature: 'page' }, t + AV_FALLBACK_LOG_EVERY_MS);
    expect(fallbacks()).toHaveLength(2);
    warn.mockRestore();
  });

  it('locks the Lua deny rule to the same reserve arithmetic', () => {
    expect(AV_LIMITER_LUA).toContain("string.match(m, '^%d+:[^:]+:([^:]+):')");
    expect(AV_LIMITER_LUA).toContain('if total + 1 + mustLeave > ceiling then return 0 end');
    const rows = [
      '1000:aa:backfill:worker-ingest',
      '1001:bb:user:page',
      '1002:cc:scheduled:daily-scan',
    ];
    for (const lane of AV_LANES) {
      const lua = luaWouldGrant({
        rows,
        lane,
        ceiling: AV_CEILING_PER_MIN,
        reserves: AV_LANE_RESERVE,
        order: AV_LANES,
      });
      const usedByLane = { user: 1, alerts: 0, scheduled: 1, backfill: 1 };
      expect(lua).toBe(decideAvTake({ lane, usedTotal: rows.length, usedByLane }).allow);
    }
    const full = Array.from({ length: AV_CEILING_PER_MIN }, (_, i) => `${i}:x:user:page`);
    expect(luaWouldGrant({
      rows: full,
      lane: 'user',
      ceiling: AV_CEILING_PER_MIN,
      reserves: AV_LANE_RESERVE,
      order: AV_LANES,
    })).toBe(false);
  });

  it('uses the local fallback when Redis eval rejects', async () => {
    redisHarness.mode.value = 'on';
    redisHarness.evalFn.mockRejectedValue(new Error('ECONNRESET'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await avTryTake({ lane: 'user', feature: 'page' }, 80_000_000)).toBe(true);
    expect(String(warn.mock.calls[0]?.[0])).toContain('error=1');
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('ECONNRESET');
    warn.mockRestore();
  });

  it('uses the local fallback when Redis eval does not return within the limiter timeout', async () => {
    redisHarness.mode.value = 'on';
    redisHarness.evalFn.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = avTryTake({ lane: 'scheduled', feature: 'page' }, 90_000_000);
    await vi.advanceTimersByTimeAsync(AV_LIMITER_REDIS_TIMEOUT_MS);
    await expect(pending).resolves.toBe(true);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('timeout=1'))).toBe(true);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('AV limiter Redis timeout'))).toBe(false);
    const redisSource = readFileSync('lib/redis.ts', 'utf8');
    expect(redisSource).toContain('export const LIMITER_REDIS_TIMEOUT_MS = 400');
    expect(redisSource).toContain('AbortSignal.timeout(LIMITER_REDIS_TIMEOUT_MS)');
    expect(redisSource).toContain('retries: 0');
    expect(AV_LIMITER_REDIS_TIMEOUT_MS).toBe(400);
    warn.mockRestore();
  });

  it('does not fall back when Redis denies the take', async () => {
    redisHarness.mode.value = 'on';
    redisHarness.evalFn.mockResolvedValue(0);
    expect(await avTryTake({ lane: 'user', feature: 'page' }, 100_000_000)).toBe(false);
    redisHarness.evalFn.mockResolvedValue(1);
    expect(await avTryTake({ lane: 'user', feature: 'page' }, 100_000_001)).toBe(true);
  });

  it('tags every cron and job route, and the worker and Jarvis entrypoints', () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name === 'route.ts') routes.push(path);
      }
    };
    walk('app/api/cron');
    walk('app/api/jobs');
    expect(routes.length).toBeGreaterThan(10);
    for (const path of routes) {
      const src = readFileSync(path, 'utf8');
      expect(src, path).toMatch(/lane:\s*'scheduled'/);
    }
    const worker = readFileSync('worker/ingest-data.ts', 'utf8');
    expect(worker).toContain("lane: 'scheduled'");
    expect(worker).toContain("feature: 'worker-ingest'");
    expect(worker).toContain("AV_PROCESS_ROLE ??= 'worker'");
    const jarvis = readFileSync('scripts/jarvis-overnight-scan.ts', 'utf8');
    expect(jarvis).toContain("lane: 'backfill'");
    expect(jarvis).toContain("AV_PROCESS_ROLE ??= 'jarvis'");
  });

  it('logs a per-feature counter line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    noteAvFeatureCall('catalyst-study-compute', 1);
    noteAvFeatureCall('catalyst-study-compute', 1);
    noteAvFeatureCall('admin-crypto-scan', 1);
    const lines = flushAvFeatureCounts();
    expect(lines).toContain('[avLimiter] feature=catalyst-study-compute calls=2');
    expect(lines).toContain('[avLimiter] feature=admin-crypto-scan calls=1');
    log.mockRestore();
  });
});
