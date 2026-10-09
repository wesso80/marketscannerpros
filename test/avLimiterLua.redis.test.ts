import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import {
  AV_JARVIS_HEARTBEAT_KEY,
  AV_LANE_RESERVE,
  AV_LIMITER_LUA,
  avBudgetPlanForMode,
  avLaneLastUsedKey,
  avLimiterEvalArgv,
  avLimiterEvalKeys,
  type AvLane,
} from '@/lib/avLimiter';

const REDIS_BIN = [process.env.REDIS_SERVER_BIN, '/usr/bin/redis-server', '/usr/local/bin/redis-server']
  .filter((path): path is string => Boolean(path) && existsSync(path))[0];

/**
 * EVAL the production limiter script on a real Redis. ioredis-mock's Lua
 * numbers are 32-bit, so a millisecond timestamp overflows there. This
 * process is Redis itself: cjson and TIME behave the way Upstash does.
 */
describe('AV limiter Lua on redis-server', () => {
  let proc: ChildProcess;
  let client: Redis;

  beforeAll(async () => {
    expect(REDIS_BIN, 'redis-server is required to eval the limiter script').toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), 'av-lua-'));
    const port = 20000 + Math.floor(Math.random() * 20000);
    proc = spawn(REDIS_BIN, [
      '--port', String(port),
      '--bind', '127.0.0.1',
      '--dir', dir,
      '--save', '',
      '--appendonly', 'no',
      '--daemonize', 'no',
      '--protected-mode', 'no',
    ], { stdio: 'ignore' });
    const started = Date.now();
    let open = false;
    while (Date.now() - started < 5_000) {
      open = await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port }, () => {
          socket.end();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
      });
      if (open) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(open).toBe(true);
    client = new Redis({ host: '127.0.0.1', port, maxRetriesPerRequest: 2 });
    await client.ping();
  }, 15_000);

  afterAll(async () => {
    if (client) await client.quit();
    proc?.kill('SIGTERM');
  });

  it('evals the production script: user floor, 120s lane marks, Redis TIME, ceiling', async () => {
    expect(AV_LIMITER_LUA).toContain("redis.call('TIME')");
    expect(AV_LIMITER_LUA).toContain('cjson.decode');
    const keys = avLimiterEvalKeys();
    const minuteKey = keys[0];

    async function grant(lane: AvLane, reserves = AV_LANE_RESERVE, ceiling = 300): Promise<number> {
      const member = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${lane}:feat`;
      const argv = avLimiterEvalArgv({ ceiling, lane, member, reserves });
      return Number(await client.eval(AV_LIMITER_LUA, keys.length, ...keys, ...argv));
    }

    async function count(lane: AvLane, reserves = AV_LANE_RESERVE, ceiling = 300): Promise<number> {
      let n = 0;
      for (let i = 0; i < ceiling + 5; i += 1) {
        if (await grant(lane, reserves, ceiling) !== 1) break;
        n += 1;
      }
      return n;
    }

    async function redisNowMs(): Promise<number> {
      const out = await client.time();
      return Number(out[0]) * 1000 + Math.floor(Number(out[1]) / 1000);
    }

    await client.flushall();
    expect(await count('scheduled')).toBe(250);
    expect(await grant('scheduled')).toBe(0);
    expect(await count('user')).toBe(50);
    expect(await grant('backfill')).toBe(0);
    expect(await client.zcard(minuteKey)).toBe(300);

    await client.flushall();
    expect(await count('user')).toBe(300);
    expect(await grant('alerts')).toBe(0);

    await client.flushall();
    await client.set(AV_JARVIS_HEARTBEAT_KEY, '1');
    expect(await count('user')).toBe(180);
    expect(await grant('user')).toBe(0);
    expect(await count('backfill')).toBe(120);
    expect(await client.zcard(minuteKey)).toBe(300);

    await client.flushall();
    expect(await grant('scheduled')).toBe(1);
    const scheduledTtl = await client.pttl(avLaneLastUsedKey('scheduled'));
    expect(scheduledTtl).toBeGreaterThan(100_000);
    expect(scheduledTtl).toBeLessThanOrEqual(120_000);
    expect(await client.get(avLaneLastUsedKey('alerts'))).toBeNull();

    await client.flushall();
    const recent = await redisNowMs();
    await client.set(avLaneLastUsedKey('scheduled'), String(recent - 90_000));
    expect(await count('user')).toBe(200);
    expect(await grant('user')).toBe(0);

    await client.flushall();
    const expired = await redisNowMs();
    await client.set(avLaneLastUsedKey('scheduled'), String(expired - 121_000));
    expect(await count('user')).toBe(300);

    await client.flushall();
    const before = Date.now();
    expect(await grant('alerts')).toBe(1);
    const scored = await client.zrange(minuteKey, 0, -1, 'WITHSCORES');
    const score = Number(scored[1]);
    expect(score).toBeGreaterThan(before - 5_000);
    expect(score).toBeLessThan(Date.now() + 5_000);
    expect(await client.pttl(avLaneLastUsedKey('alerts'))).toBeGreaterThan(100_000);
    expect(await client.get(avLaneLastUsedKey('scheduled'))).toBeNull();

    await client.flushall();
    const wide = avBudgetPlanForMode('540');
    expect(wide.reserves.user).toBe(90);
    expect(await count('scheduled', wide.reserves, wide.ceiling)).toBe(wide.ceiling - 90);

    await client.flushall();
    const lanes: AvLane[] = ['user', 'alerts', 'scheduled', 'backfill'];
    let granted = 0;
    for (let i = 0; i < 500; i += 1) {
      if (i === 40) await client.set(AV_JARVIS_HEARTBEAT_KEY, '1');
      if (await grant(lanes[i % lanes.length]) === 1) granted += 1;
      expect(granted).toBeLessThanOrEqual(300);
    }
    expect(await client.zcard(minuteKey)).toBe(granted);
    expect(granted).toBeLessThanOrEqual(300);
  });
});
