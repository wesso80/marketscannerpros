/**
 * Shared Alpha Vantage limiter for web and worker.
 *
 * One sliding 60s window in Upstash Redis (the store avRateGovernor already used).
 * Safe ceiling is 540/min, under the 600/min licence. A denied call waits and
 * retries this window. It does not take a second token from a private bucket.
 *
 * Priority, highest first: user, alerts, scheduled, backfill.
 * Each higher lane keeps an unused reserve. A lower lane may use only what is
 * left after those reserves. A higher lane may use the whole ceiling.
 *
 * When Redis is missing, this process uses a 150/min emergency window with the
 * same priority shares scaled down. That is not the shared budget.
 *
 * Jarvis on another machine takes from this budget with
 * POST /api/internal/av-budget (x-cron-secret). See AV_BUDGET_CONTRACT.
 * A copy of the scripts that does not call that route is outside the budget.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRedis } from '@/lib/redis';

export const AV_CEILING_PER_MIN = 540;
export const AV_LOCAL_EMERGENCY_PER_MIN = 150;
export const AV_BUDGET_PATH = '/api/internal/av-budget';
export const AV_LANES = ['user', 'alerts', 'scheduled', 'backfill'] as const;
export type AvLane = (typeof AV_LANES)[number];

/** Unused headroom kept for each lane. Sum is the 540 ceiling. */
export const AV_LANE_RESERVE: Record<AvLane, number> = {
  user: 120,
  alerts: 80,
  scheduled: 240,
  backfill: 100,
};

export const AV_BUDGET_CONTRACT = {
  method: 'POST',
  path: AV_BUDGET_PATH,
  auth: 'x-cron-secret (same value as CRON_SECRET)',
  body: { lane: 'backfill', feature: 'jarvis-overnight', count: 1 },
  countMax: 20,
  granted: { granted: 1, ceiling: AV_CEILING_PER_MIN, lane: 'backfill', feature: 'jarvis-overnight', retryAfterMs: 0 },
  note: 'Take one token per Alpha Vantage HTTP call. Do not call Alpha Vantage when granted is 0. Jarvis must adopt this.',
} as const;

const REDIS_KEY = 'av_limiter:minute';
const WINDOW_MS = 60_000;

export interface AvBudget {
  lane: AvLane;
  feature: string;
}

const budgetContext = new AsyncLocalStorage<AvBudget>();

export function runWithAvBudget<T>(budget: AvBudget, fn: () => T): T {
  return budgetContext.run(normalizeBudget(budget), fn);
}

export function currentAvBudget(): AvBudget | undefined {
  return budgetContext.getStore();
}

export function normalizeBudget(input?: Partial<AvBudget> | null): AvBudget {
  const ctx = budgetContext.getStore();
  const lane = isLane(input?.lane) ? input.lane : ctx?.lane ?? 'user';
  const feature = sanitizeFeature(input?.feature || ctx?.feature || 'unspecified');
  return { lane, feature };
}

function isLane(value: unknown): value is AvLane {
  return typeof value === 'string' && (AV_LANES as readonly string[]).includes(value);
}

export function sanitizeFeature(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return cleaned || 'unspecified';
}

export function reservesForCeiling(ceiling: number): Record<AvLane, number> {
  if (ceiling === AV_CEILING_PER_MIN) return { ...AV_LANE_RESERVE };
  const rows = AV_LANES.map((lane) => {
    const exact = (AV_LANE_RESERVE[lane] * ceiling) / AV_CEILING_PER_MIN;
    return { lane, exact, n: Math.floor(exact) };
  });
  let left = ceiling - rows.reduce((sum, row) => sum + row.n, 0);
  const byRemainder = [...rows].sort((a, b) => (b.exact - b.n) - (a.exact - a.n) || AV_LANES.indexOf(a.lane) - AV_LANES.indexOf(b.lane));
  for (const row of byRemainder) {
    if (left <= 0) break;
    row.n += 1;
    left -= 1;
  }
  return Object.fromEntries(rows.map((row) => [row.lane, row.n])) as Record<AvLane, number>;
}

export function decideAvTake(input: {
  lane: AvLane;
  usedTotal: number;
  usedByLane: Partial<Record<AvLane, number>>;
  ceiling?: number;
  reserve?: Record<AvLane, number>;
}): { allow: boolean; mustLeave: number } {
  const ceiling = input.ceiling ?? AV_CEILING_PER_MIN;
  const reserve = input.reserve ?? reservesForCeiling(ceiling);
  let mustLeave = 0;
  for (const higher of AV_LANES) {
    if (higher === input.lane) break;
    mustLeave += Math.max(0, (reserve[higher] ?? 0) - (input.usedByLane[higher] ?? 0));
  }
  return { allow: input.usedTotal + 1 + mustLeave <= ceiling, mustLeave };
}

const EVAL_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local ceiling = tonumber(ARGV[3])
local lane = ARGV[4]
local member = ARGV[5]
local reserves = cjson.decode(ARGV[6])
local order = cjson.decode(ARGV[7])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local rows = redis.call('ZRANGE', key, 0, -1)
local used = {}
for _, name in ipairs(order) do used[name] = 0 end
local total = #rows
for _, m in ipairs(rows) do
  local l = string.match(m, '^%d+:[^:]+:([^:]+):')
  if l and used[l] ~= nil then used[l] = used[l] + 1 end
end
local mustLeave = 0
for _, name in ipairs(order) do
  if name == lane then break end
  local unused = (reserves[name] or 0) - (used[name] or 0)
  if unused > 0 then mustLeave = mustLeave + unused end
end
if total + 1 + mustLeave > ceiling then return 0 end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, 70)
return 1
`;

type LocalEvent = { at: number; lane: AvLane };
const localEvents: LocalEvent[] = [];
let loggedEmergency = false;

function localSnapshot(now: number): { usedTotal: number; usedByLane: Record<AvLane, number> } {
  const cutoff = now - WINDOW_MS;
  const live = localEvents.filter((event) => event.at > cutoff);
  localEvents.length = 0;
  localEvents.push(...live);
  const usedByLane = Object.fromEntries(AV_LANES.map((lane) => [lane, 0])) as Record<AvLane, number>;
  for (const event of localEvents) usedByLane[event.lane] += 1;
  return { usedTotal: localEvents.length, usedByLane };
}

function tryLocal(lane: AvLane, now: number): boolean {
  if (!loggedEmergency) {
    loggedEmergency = true;
    console.warn(`[avLimiter] shared store unavailable; local emergency cap ${AV_LOCAL_EMERGENCY_PER_MIN}/min`);
  }
  const snap = localSnapshot(now);
  const decision = decideAvTake({
    lane,
    usedTotal: snap.usedTotal,
    usedByLane: snap.usedByLane,
    ceiling: AV_LOCAL_EMERGENCY_PER_MIN,
    reserve: reservesForCeiling(AV_LOCAL_EMERGENCY_PER_MIN),
  });
  if (!decision.allow) return false;
  localEvents.push({ at: now, lane });
  return true;
}

async function tryRedis(budget: AvBudget, now: number): Promise<boolean | null> {
  const redis = getRedis();
  if (!redis) return null;
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}:${budget.lane}:${budget.feature}`;
  try {
    if (typeof redis.eval === 'function') {
      const granted = await redis.eval(
        EVAL_SCRIPT,
        [REDIS_KEY],
        [String(now), String(WINDOW_MS), String(AV_CEILING_PER_MIN), budget.lane, member, JSON.stringify(AV_LANE_RESERVE), JSON.stringify(AV_LANES)],
      );
      return Number(granted) === 1;
    }
  } catch (err) {
    console.warn('[avLimiter] Redis eval failed, using a counted read:', (err as Error).message);
  }
  try {
    await redis.zremrangebyscore(REDIS_KEY, 0, now - WINDOW_MS);
    const rows = (await redis.zrange(REDIS_KEY, 0, -1)) as string[];
    const usedByLane = Object.fromEntries(AV_LANES.map((lane) => [lane, 0])) as Record<AvLane, number>;
    for (const row of rows) {
      const lane = String(row).split(':')[2] as AvLane;
      if (usedByLane[lane] != null) usedByLane[lane] += 1;
    }
    const decision = decideAvTake({ lane: budget.lane, usedTotal: rows.length, usedByLane });
    if (!decision.allow) return false;
    await redis.zadd(REDIS_KEY, { score: now, member });
    await redis.expire(REDIS_KEY, 70);
    const used = await redis.zcard(REDIS_KEY);
    if ((used ?? 0) > AV_CEILING_PER_MIN) {
      await redis.zrem(REDIS_KEY, member);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[avLimiter] Redis error:', (err as Error).message);
    return null;
  }
}

const featureCounts = new Map<string, number>();
let featureWindowStart = Date.now();

export function noteAvFeatureCall(feature: string, now = Date.now()): void {
  if (now - featureWindowStart >= WINDOW_MS) {
    flushAvFeatureCounts();
    featureWindowStart = now;
  }
  featureCounts.set(feature, (featureCounts.get(feature) ?? 0) + 1);
}

export function flushAvFeatureCounts(): string[] {
  const lines: string[] = [];
  for (const [feature, calls] of featureCounts) {
    if (calls <= 0) continue;
    const line = `[avLimiter] feature=${feature} calls=${calls}`;
    console.log(line);
    lines.push(line);
  }
  featureCounts.clear();
  return lines;
}

/** One non-blocking attempt. Null from Redis becomes the local emergency cap, not an extra budget on top of Redis. */
export async function avTryTake(input?: Partial<AvBudget>, now = Date.now()): Promise<boolean> {
  const budget = normalizeBudget(input);
  const redisResult = await tryRedis(budget, now);
  const granted = redisResult === null ? tryLocal(budget.lane, now) : redisResult;
  if (granted) noteAvFeatureCall(budget.feature, now);
  return granted;
}

const WAIT_MS: Record<AvLane, number> = { user: 2_000, alerts: 8_000, scheduled: 15_000, backfill: 20_000 };

export async function avTakeToken(input?: Partial<AvBudget>): Promise<void> {
  const budget = normalizeBudget(input);
  const deadline = Date.now() + WAIT_MS[budget.lane];
  for (;;) {
    if (await avTryTake(budget)) return;
    if (Date.now() >= deadline) {
      throw new Error(`AV limiter denied ${budget.feature} (${budget.lane})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function avWaitMs(lane: AvLane): number {
  return WAIT_MS[lane];
}
