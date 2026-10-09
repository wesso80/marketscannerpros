/**
 * Shared Alpha Vantage limiter for web, worker, and the Jarvis cron.
 *
 * Licence is 600 calls/min. A process with Upstash and a process without it do
 * not share a counter, so their allowances add:
 *
 *   shared Redis ceiling          300  web + worker while Upstash answers
 *   web fallback                  80   this web process after a timeout or with no Redis
 *   worker fallback              100   the ingest process after a timeout or with no Redis
 *   Jarvis fallback              120   jarvis-overnight when the cron has no Upstash keys
 *   sum                          600  hard stop: this module throws if the sum exceeds 600
 *
 * Each allowance stays under 540. Jarvis's 120 is its explicit need (the cron's
 * ALPHA_VANTAGE_RPM is 120; a weekday run is about 2,389 calls). On the fallback
 * that whole 120 is usable by the backfill lane. It is not the ~28 left after
 * holding the higher-lane reserves of a shared 150 window.
 *
 * Joining the shared Redis budget needs UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN on that process. No other env var.
 *
 * Priority, highest first: user, alerts, scheduled, backfill.
 * A lower lane must leave unused higher reserves. Untagged calls are scheduled,
 * so a cron that forgot a tag does not spend the user reserve.
 *
 * Limiter Redis commands abort after LIMITER_REDIS_TIMEOUT_MS. Timeout or error
 * uses this process's fallback. That spend is already inside the sum above.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getLimiterRedis, LIMITER_REDIS_TIMEOUT_MS } from '@/lib/redis';

export const AV_LICENCE_PER_MIN = 600;
export const AV_SINGLE_PROCESS_CAP = 539;
export const AV_CEILING_PER_MIN = 300;
export const AV_WEB_FALLBACK_PER_MIN = 80;
export const AV_WORKER_FALLBACK_PER_MIN = 100;
/** Explicit Jarvis overnight need when this process has no shared store. */
export const AV_JARVIS_FALLBACK_PER_MIN = 120;
export const AV_JARVIS_FEATURE = 'jarvis-overnight';
export const AV_WORKER_FEATURE = 'worker-ingest';
export const AV_LIMITER_REDIS_TIMEOUT_MS = LIMITER_REDIS_TIMEOUT_MS;
export const AV_FALLBACK_LOG_EVERY_MS = 5 * 60_000;
export const AV_BUDGET_PATH = '/api/internal/av-budget';
export const AV_LANES = ['user', 'alerts', 'scheduled', 'backfill'] as const;
export type AvLane = (typeof AV_LANES)[number];

/** Unused headroom kept for each lane. Sum is the shared Redis ceiling. */
export const AV_LANE_RESERVE: Record<AvLane, number> = {
  user: 67,
  alerts: 44,
  scheduled: 133,
  backfill: 56,
};

const AV_ALLOWANCES = [
  AV_CEILING_PER_MIN,
  AV_WEB_FALLBACK_PER_MIN,
  AV_WORKER_FALLBACK_PER_MIN,
  AV_JARVIS_FALLBACK_PER_MIN,
] as const;

export const AV_ALLOWANCE_SUM = AV_ALLOWANCES.reduce((sum, n) => sum + n, 0);

if (AV_ALLOWANCE_SUM > AV_LICENCE_PER_MIN || AV_ALLOWANCES.some((n) => n > AV_SINGLE_PROCESS_CAP)) {
  throw new Error(`AV allowances sum to ${AV_ALLOWANCE_SUM}, above the ${AV_LICENCE_PER_MIN}/min licence`);
}

export const AV_BUDGET_CONTRACT = {
  method: 'POST',
  path: AV_BUDGET_PATH,
  auth: 'x-cron-secret (same value as CRON_SECRET)',
  body: { lane: 'backfill', feature: 'jarvis-overnight', count: 1 },
  countMax: 20,
  granted: { granted: 1, ceiling: AV_CEILING_PER_MIN, lane: 'backfill', feature: 'jarvis-overnight', retryAfterMs: 0 },
  note: 'Take one token per Alpha Vantage HTTP call. Do not call Alpha Vantage when granted is 0. The Jarvis cron already uses this process limiter. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN put it on the shared 300/min window; without them it uses the 120/min fallback.',
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
  const lane = isLane(input?.lane) ? input.lane : ctx?.lane ?? 'scheduled';
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

export const AV_LIMITER_LUA = `
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
let lastFallbackLog = 0;
let lastRedisProblem = '';

export function fallbackBudget(feature: string): { ceiling: number; reserve: Record<AvLane, number> } {
  if (feature === AV_JARVIS_FEATURE) {
    return {
      ceiling: AV_JARVIS_FALLBACK_PER_MIN,
      reserve: { user: 0, alerts: 0, scheduled: 0, backfill: AV_JARVIS_FALLBACK_PER_MIN },
    };
  }
  if (feature === AV_WORKER_FEATURE) {
    return {
      ceiling: AV_WORKER_FALLBACK_PER_MIN,
      reserve: { user: 0, alerts: 0, scheduled: AV_WORKER_FALLBACK_PER_MIN, backfill: 0 },
    };
  }
  return { ceiling: AV_WEB_FALLBACK_PER_MIN, reserve: reservesForCeiling(AV_WEB_FALLBACK_PER_MIN) };
}

/** Test hook. Clears the in-process window and the fallback log clock. */
export function resetAvLimiterLocalForTests(): void {
  localEvents.length = 0;
  lastFallbackLog = 0;
  lastRedisProblem = '';
}

function localSnapshot(now: number): { usedTotal: number; usedByLane: Record<AvLane, number> } {
  const cutoff = now - WINDOW_MS;
  const live = localEvents.filter((event) => event.at > cutoff);
  localEvents.length = 0;
  localEvents.push(...live);
  const usedByLane = Object.fromEntries(AV_LANES.map((lane) => [lane, 0])) as Record<AvLane, number>;
  for (const event of localEvents) usedByLane[event.lane] += 1;
  return { usedTotal: localEvents.length, usedByLane };
}

function tryLocal(lane: AvLane, feature: string, now: number): boolean {
  const budget = fallbackBudget(feature);
  if (now - lastFallbackLog >= AV_FALLBACK_LOG_EVERY_MS) {
    lastFallbackLog = now;
    const problem = lastRedisProblem ? `; ${lastRedisProblem}` : '';
    console.warn(`[avLimiter] shared store unavailable${problem}; local fallback cap ${budget.ceiling}/min feature=${feature}`);
  }
  const snap = localSnapshot(now);
  const decision = decideAvTake({
    lane,
    usedTotal: snap.usedTotal,
    usedByLane: snap.usedByLane,
    ceiling: budget.ceiling,
    reserve: budget.reserve,
  });
  if (!decision.allow) return false;
  localEvents.push({ at: now, lane });
  return true;
}

function limiterTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AV limiter Redis timeout')), AV_LIMITER_REDIS_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function tryRedis(budget: AvBudget, now: number): Promise<boolean | null> {
  const redis = getLimiterRedis();
  if (!redis) return null;
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}:${budget.lane}:${budget.feature}`;
  try {
    return await limiterTimeout((async () => {
      if (typeof redis.eval === 'function') {
        const granted = await redis.eval(
          AV_LIMITER_LUA,
          [REDIS_KEY],
          [String(now), String(WINDOW_MS), String(AV_CEILING_PER_MIN), budget.lane, member, JSON.stringify(AV_LANE_RESERVE), JSON.stringify(AV_LANES)],
        );
        return Number(granted) === 1;
      }
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
    })());
  } catch (err) {
    lastRedisProblem = (err as Error).message || 'redis error';
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

/** One non-blocking attempt. A Redis timeout or error uses this process's fallback. A denial does not. */
export async function avTryTake(input?: Partial<AvBudget>, now = Date.now()): Promise<boolean> {
  const budget = normalizeBudget(input);
  const redisResult = await tryRedis(budget, now);
  const granted = redisResult === null ? tryLocal(budget.lane, budget.feature, now) : redisResult;
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
