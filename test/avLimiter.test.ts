import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisHarness = vi.hoisted(() => {
  const evalFn = vi.fn();
  const setFn = vi.fn();
  const delFn = vi.fn();
  const getFn = vi.fn();
  return {
    evalFn,
    setFn,
    delFn,
    getFn,
    mode: { value: 'off' as 'off' | 'on' },
  };
});

vi.mock('@/lib/redis', () => ({
  getRedis: () => null,
  getLimiterRedis: () => (redisHarness.mode.value === 'on'
    ? { eval: redisHarness.evalFn, set: redisHarness.setFn, del: redisHarness.delFn, get: redisHarness.getFn }
    : null),
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
  AV_JARVIS_HEARTBEAT_EVERY_MS,
  AV_JARVIS_HEARTBEAT_KEY,
  AV_JARVIS_HEARTBEAT_TTL_SEC,
  AV_LANE_ACTIVE_MS,
  avLaneLastUsedKey,
  avLimiterEvalKeys,
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
  clearJarvisHeartbeat,
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
  touchJarvisHeartbeat,
  webFallbackReserve,
} from '@/lib/avLimiter';

/** Same steps as AV_LIMITER_LUA: hold unmet floors of other active lanes, deny when total + 1 + mustLeave > ceiling. */
function luaWouldGrant(input: {
  rows: string[];
  lane: string;
  ceiling: number;
  reserves: Record<string, number>;
  order: readonly string[];
  jarvisActive?: boolean;
  laneActive?: Partial<Record<string, boolean>>;
}): boolean {
  const used: Record<string, number> = {};
  for (const name of input.order) used[name] = 0;
  const total = input.rows.length;
  for (const member of input.rows) {
    const lane = /^\d+:[^:]+:([^:]+):/.exec(member)?.[1];
    if (lane && used[lane] != null) used[lane] += 1;
  }
  let mustLeave = 0;
  for (const name of input.order) {
    if (name === input.lane) continue;
    const count = used[name] || 0;
    const floor = input.reserves[name] || 0;
    const reserved = floor > 0 && (
      name === 'user'
        ? true
        : name === 'backfill'
          ? Boolean(input.jarvisActive)
          : count > 0 || Boolean(input.laneActive?.[name])
    );
    if (reserved) mustLeave += Math.max(0, floor - count);
  }
  return total + 1 + mustLeave <= input.ceiling;
}

function takesFrom(
  lane: AvLane,
  start: Partial<Record<AvLane, number>>,
  opts?: { ceiling?: number; reserve?: Record<AvLane, number>; jarvisActive?: boolean; laneActive?: Partial<Record<AvLane, boolean>> },
): number {
  const usedByLane: Record<AvLane, number> = { user: 0, alerts: 0, scheduled: 0, backfill: 0, ...start };
  let total = AV_LANES.reduce((sum, name) => sum + usedByLane[name], 0);
  let n = 0;
  while (decideAvTake({ lane, usedTotal: total, usedByLane, ...opts }).allow) {
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
    redisHarness.setFn.mockReset();
    redisHarness.delFn.mockReset();
    redisHarness.getFn.mockReset();
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
    expect(webFallbackReserve(AV_WEB_FALLBACK_PER_MIN)).toEqual({ user: 22, alerts: 13, scheduled: 45, backfill: 0 });
    expect(webFallbackReserve(20)).toEqual({ user: 6, alerts: 3, scheduled: 11, backfill: 0 });
    expect(AV_LANES.reduce((sum, lane) => sum + webFallbackReserve(AV_WEB_FALLBACK_PER_MIN)[lane], 0)).toBe(80);
    expect(AV_LANES.reduce((sum, lane) => sum + webFallbackReserve(20)[lane], 0)).toBe(20);
    expect(() => readAvBudgetMode({ AV_BUDGET_MODE: 'wide' } as NodeJS.ProcessEnv)).toThrow(/AV_BUDGET_MODE=wide/);
    expect(() => refuseIllegalAvBudget({ ...split, worstCase: 601 })).toThrow(/AV_BUDGET_MODE=split/);
    expect(() => refuseIllegalAvBudget({ ...wide, webFallback: 21 })).toThrow(/AV_BUDGET_MODE=540/);
    expect(() => refuseIllegalAvBudget({ ...wide, webFallback: 21 })).toThrow(/601/);
    expect(() => applyAvBudgetForTests({ AV_BUDGET_MODE: '540' })).not.toThrow();
    expect(fallbackBudget('web')).toEqual({
      ceiling: 20,
      reserve: { user: 6, alerts: 3, scheduled: 11, backfill: 0 },
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

  it('always reserves the user floor, including when that lane has not called', () => {
    expect(takesFrom('scheduled', {})).toBe(AV_CEILING_PER_MIN - AV_LANE_RESERVE.user);
    expect(takesFrom('scheduled', {})).toBe(250);
    expect(takesFrom('alerts', {})).toBe(250);
    expect(takesFrom('backfill', {})).toBe(250);
    const wide = avBudgetPlanForMode('540');
    expect(wide.reserves.user).toBe(90);
    expect(takesFrom('scheduled', {}, { ceiling: wide.ceiling, reserve: wide.reserves })).toBe(wide.ceiling - 90);
    expect(takesFrom('backfill', {}, { ceiling: wide.ceiling, reserve: wide.reserves })).toBe(wide.ceiling - 90);
    expect(takesFrom('user', {})).toBe(AV_CEILING_PER_MIN);
  });

  it('lets scheduled use idle backfill capacity well above 100', () => {
    const floorsMet = { user: 50, alerts: 30, scheduled: 0, backfill: 0 };
    expect(takesFrom('scheduled', floorsMet)).toBe(220);
    expect(takesFrom('scheduled', floorsMet)).toBeGreaterThan(100);
    expect(takesFrom('scheduled', {})).toBeGreaterThan(100);
  });

  it('holds the scheduled floor on the process fallback for 120s after its last call', async () => {
    const t = 90_000_000;
    expect(await avTryTake({ lane: 'scheduled', feature: 'daily-scan' }, t)).toBe(true);
    let user = 0;
    for (let i = 0; i < 80; i += 1) {
      if (await avTryTake({ lane: 'user', feature: 'page' }, t + 90_000 + i)) user += 1;
    }
    expect(user).toBe(35);
    resetAvLimiterLocalForTests();
    expect(await avTryTake({ lane: 'scheduled', feature: 'daily-scan' }, t)).toBe(true);
    user = 0;
    for (let i = 0; i < 80; i += 1) {
      if (await avTryTake({ lane: 'user', feature: 'page' }, t + AV_LANE_ACTIVE_MS + i)) user += 1;
    }
    expect(user).toBe(AV_WEB_FALLBACK_PER_MIN);
  });

  it('keeps alerts and scheduled active for 120s after their last call', () => {
    expect(AV_LANE_ACTIVE_MS).toBe(120_000);
    expect(takesFrom('user', {}, { laneActive: { scheduled: true } })).toBe(200);
    expect(takesFrom('backfill', {}, { laneActive: { scheduled: true } })).toBe(150);
    expect(takesFrom('user', {}, { laneActive: { alerts: true } })).toBe(270);
    expect(takesFrom('user', {}, { laneActive: { alerts: true, scheduled: true } })).toBe(170);
    expect(takesFrom('user', { scheduled: 40 }, { laneActive: { scheduled: true } })).toBe(200);
  });

  it('lets the user reach 200 per minute while the worker is running', () => {
    expect(takesFrom('user', { scheduled: 80 })).toBe(200);
    expect(takesFrom('user', { scheduled: 100 })).toBe(200);
  });

  it('keeps the scheduled floor after heavy user borrowing', () => {
    expect(takesFrom('user', { scheduled: 1 })).toBe(200);
    expect(takesFrom('scheduled', { scheduled: 1, user: 200 })).toBe(99);
    expect(1 + 200 + 99).toBe(AV_CEILING_PER_MIN);
  });

  it('holds 120 for Jarvis while its heartbeat is active under user and scheduled load', () => {
    expect(takesFrom('user', { scheduled: 100 }, { jarvisActive: true })).toBe(80);
    expect(takesFrom('scheduled', { user: 80 }, { jarvisActive: true })).toBe(100);
    expect(takesFrom('backfill', { user: 80, scheduled: 100 }, { jarvisActive: true })).toBe(120);
    const wide = avBudgetPlanForMode('540');
    const opts = { ceiling: wide.ceiling, reserve: wide.reserves, jarvisActive: true };
    expect(takesFrom('user', { scheduled: 180, user: 90 }, opts)).toBe(54);
    expect(takesFrom('backfill', { scheduled: 180, user: 144 }, opts)).toBe(216);
  });

  it('lends the backfill floor when the Jarvis heartbeat is absent', () => {
    expect(takesFrom('user', { scheduled: 100 })).toBe(200);
    expect(takesFrom('backfill', { user: 200, scheduled: 100 })).toBe(0);
    expect(takesFrom('scheduled', { user: 50, alerts: 30 })).toBe(220);
  });

  it('never lets the lanes add up past the ceiling', () => {
    const fill = (jarvisActive: boolean) => {
      const usedByLane: Record<AvLane, number> = { user: 0, alerts: 0, scheduled: 0, backfill: 0 };
      let total = 0;
      for (let guard = 0; guard < 1000; guard += 1) {
        let progressed = false;
        for (const lane of AV_LANES) {
          if (!decideAvTake({ lane, usedTotal: total, usedByLane, jarvisActive }).allow) continue;
          usedByLane[lane] += 1;
          total += 1;
          progressed = true;
        }
        if (!progressed) break;
      }
      for (const lane of AV_LANES) {
        expect(decideAvTake({ lane, usedTotal: total, usedByLane, jarvisActive }).allow).toBe(false);
      }
      return total;
    };
    expect(fill(false)).toBe(AV_CEILING_PER_MIN);
    expect(fill(true)).toBe(AV_CEILING_PER_MIN);
    const wide = avBudgetPlanForMode('540');
    const usedByLane = { user: wide.ceiling, alerts: 0, scheduled: 0, backfill: 0 };
    for (const lane of AV_LANES) {
      expect(decideAvTake({ lane, usedTotal: wide.ceiling, usedByLane, ceiling: wide.ceiling, reserve: wide.reserves, jarvisActive: true }).allow).toBe(false);
    }
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
    expect(fallbackBudget('web').reserve).toEqual({ user: 22, alerts: 13, scheduled: 45, backfill: 0 });
    expect(postedAsJarvis).toBe(AV_WEB_FALLBACK_PER_MIN - fallbackBudget('web').reserve.user);
    expect(postedAsJarvis).toBe(58);
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
    expect(web).toBe(AV_WEB_FALLBACK_PER_MIN);
    const webReserve = fallbackBudget('web').reserve;
    expect(takesFrom('user', { scheduled: 1 }, { ceiling: AV_WEB_FALLBACK_PER_MIN, reserve: webReserve })).toBe(35);
    expect(takesFrom('scheduled', { scheduled: 1, user: 35 }, { ceiling: AV_WEB_FALLBACK_PER_MIN, reserve: webReserve })).toBe(44);
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
    expect(AV_LIMITER_LUA).toContain("redis.call('GET', heartbeat)");
    expect(AV_LIMITER_LUA).toContain("redis.call('TIME')");
    expect(AV_LIMITER_LUA).toContain("name == 'user' then reserved = true");
    expect(AV_LIMITER_LUA).toContain("redis.call('SET', scheduledLast, tostring(now), 'PX', activeMs)");
    expect(AV_LIMITER_LUA).toContain("name == 'backfill'");
    expect(avLimiterEvalKeys()).toEqual([
      'av_limiter:minute',
      AV_JARVIS_HEARTBEAT_KEY,
      avLaneLastUsedKey('alerts'),
      avLaneLastUsedKey('scheduled'),
    ]);
    const rows = [
      '1000:aa:backfill:worker-ingest',
      '1001:bb:user:page',
      '1002:cc:scheduled:daily-scan',
    ];
    const usedByLane = { user: 1, alerts: 0, scheduled: 1, backfill: 1 };
    for (const jarvisActive of [false, true]) {
      for (const lane of AV_LANES) {
        const lua = luaWouldGrant({
          rows,
          lane,
          ceiling: AV_CEILING_PER_MIN,
          reserves: AV_LANE_RESERVE,
          order: AV_LANES,
          jarvisActive,
        });
        expect(lua).toBe(decideAvTake({ lane, usedTotal: rows.length, usedByLane, jarvisActive }).allow);
      }
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
    expect(redisHarness.evalFn).toHaveBeenCalledWith(
      AV_LIMITER_LUA,
      avLimiterEvalKeys(),
      expect.any(Array),
    );
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
    expect(jarvis).toContain('touchJarvisHeartbeat()');
    expect(jarvis).toContain('clearJarvisHeartbeat()');
    expect(jarvis).toContain('AV_JARVIS_HEARTBEAT_EVERY_MS');
  });

  it('writes the Jarvis heartbeat with a TTL and deletes it when the run ends', async () => {
    redisHarness.mode.value = 'on';
    await touchJarvisHeartbeat();
    expect(redisHarness.setFn).toHaveBeenCalledWith(AV_JARVIS_HEARTBEAT_KEY, '1', { ex: AV_JARVIS_HEARTBEAT_TTL_SEC });
    expect(AV_JARVIS_HEARTBEAT_TTL_SEC).toBeGreaterThan(AV_JARVIS_HEARTBEAT_EVERY_MS / 1000);
    await clearJarvisHeartbeat();
    expect(redisHarness.delFn).toHaveBeenCalledWith(AV_JARVIS_HEARTBEAT_KEY);
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
