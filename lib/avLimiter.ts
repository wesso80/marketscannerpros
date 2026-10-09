/**
 * Shared Alpha Vantage limiter for web, worker, and the Jarvis cron.
 *
 * Licence is 600 calls/min. AV_BUDGET_MODE picks the split. AV_PROCESS_ROLE
 * picks this process's fallback. A feature name does not.
 *
 * split (default). A Redis timeout can still land server-side, so fallbacks add:
 *   shared Redis ceiling          300
 *   web fallback                   80
 *   worker fallback               100
 *   Jarvis fallback               120
 *   worst case                    600
 *   lane reserves on 300: user 50, alerts 30, scheduled 100, backfill 120
 *   Jarvis floor on that ceiling: 300 - (50 + 30 + 100) = 120
 *
 * 540. Everyone shares 540. Fallbacks stay 80 / 100 / 120 and sit inside that
 * 540; they are not added again. Lanes scale by 540/300:
 *   user 90, alerts 54, scheduled 180, backfill 216
 *   Jarvis floor: 540 - (90 + 54 + 180) = 216, which is at least 120
 *   worst case                    540
 *
 * Startup throws if the worst case is above 600 or Jarvis's shared floor is
 * below 120. The message names AV_BUDGET_MODE.
 *
 * Untagged calls are the user lane (a page request). Cron routes, job routes,
 * and the worker pass their lane. Joining the shared window needs
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 *
 * Priority, highest first: user, alerts, scheduled, backfill.
 * A lower lane must leave unused higher reserves.
 * Limiter Redis commands abort after 400ms. Timeout or error uses this
 * process's fallback. The fallback log is a count of codes (timeout, error,
 * absent), once per 5 minutes.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import * as redisModule from '@/lib/redis';

export const AV_LICENCE_PER_MIN = 600;
export const AV_SINGLE_PROCESS_CAP = 539;
export const AV_SPLIT_CEILING_PER_MIN = 300;
export const AV_540_CEILING_PER_MIN = 540;
/** Split-mode shared ceiling. The live ceiling is currentAvBudgetPlan().ceiling. */
export const AV_CEILING_PER_MIN = AV_SPLIT_CEILING_PER_MIN;
export const AV_WEB_FALLBACK_PER_MIN = 80;
export const AV_WORKER_FALLBACK_PER_MIN = 100;
/** Jarvis need on the shared pool and on the Jarvis process fallback. */
export const AV_JARVIS_FALLBACK_PER_MIN = 120;
export const AV_JARVIS_FEATURE = 'jarvis-overnight';
export const AV_WORKER_FEATURE = 'worker-ingest';
/** Same 400ms as LIMITER_REDIS_TIMEOUT_MS in lib/redis.ts. Not imported, so a Redis mock that only stubs getRedis still loads. */
export const AV_LIMITER_REDIS_TIMEOUT_MS = 400;
export const AV_FALLBACK_LOG_EVERY_MS = 5 * 60_000;
export const AV_BUDGET_PATH = '/api/internal/av-budget';
export const AV_LANES = ['user', 'alerts', 'scheduled', 'backfill'] as const;
export type AvLane = (typeof AV_LANES)[number];
export type AvBudgetMode = 'split' | '540';
export type AvProcessRole = 'web' | 'worker' | 'jarvis';
export type AvFallbackCode = 'timeout' | 'error' | 'absent';

/**
 * Split reserves. Backfill is 120 so Jarvis still has 120 when the higher
 * lanes have not spent their reserves: 300 - (50 + 30 + 100) = 120.
 */
export const AV_LANE_RESERVE: Record<AvLane, number> = {
  user: 50,
  alerts: 30,
  scheduled: 100,
  backfill: 120,
};

export interface AvBudgetPlan {
  mode: AvBudgetMode;
  ceiling: number;
  reserves: Record<AvLane, number>;
  webFallback: number;
  workerFallback: number;
  jarvisFallback: number;
  /** Redis spend and fallbacks together. Must be at most the licence. */
  worstCase: number;
  jarvisFloor: number;
}

export function reservesForCeiling(ceiling: number, base: Record<AvLane, number> = AV_LANE_RESERVE, baseCeiling = AV_SPLIT_CEILING_PER_MIN): Record<AvLane, number> {
  if (ceiling === baseCeiling) return { ...base };
  const rows = AV_LANES.map((lane) => {
    const exact = (base[lane] * ceiling) / baseCeiling;
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

export function jarvisSharedFloor(ceiling: number, reserves: Record<AvLane, number>): number {
  return ceiling - reserves.user - reserves.alerts - reserves.scheduled;
}

export function avBudgetPlanForMode(mode: AvBudgetMode): AvBudgetPlan {
  const webFallback = AV_WEB_FALLBACK_PER_MIN;
  const workerFallback = AV_WORKER_FALLBACK_PER_MIN;
  const jarvisFallback = AV_JARVIS_FALLBACK_PER_MIN;
  if (mode === '540') {
    const ceiling = AV_540_CEILING_PER_MIN;
    const reserves = reservesForCeiling(ceiling);
    return {
      mode,
      ceiling,
      reserves,
      webFallback,
      workerFallback,
      jarvisFallback,
      worstCase: ceiling,
      jarvisFloor: jarvisSharedFloor(ceiling, reserves),
    };
  }
  const ceiling = AV_SPLIT_CEILING_PER_MIN;
  const reserves = { ...AV_LANE_RESERVE };
  return {
    mode: 'split',
    ceiling,
    reserves,
    webFallback,
    workerFallback,
    jarvisFallback,
    worstCase: ceiling + webFallback + workerFallback + jarvisFallback,
    jarvisFloor: jarvisSharedFloor(ceiling, reserves),
  };
}

export function readAvBudgetMode(env: NodeJS.ProcessEnv = process.env): AvBudgetMode {
  const raw = (env.AV_BUDGET_MODE ?? 'split').trim().toLowerCase();
  if (raw === '' || raw === 'split') return 'split';
  if (raw === '540') return '540';
  throw new Error(`AV_BUDGET_MODE=${raw} is not a known budget. Set AV_BUDGET_MODE to split or 540. Refusing to start.`);
}

export function refuseIllegalAvBudget(plan: AvBudgetPlan): AvBudgetPlan {
  if (plan.worstCase > AV_LICENCE_PER_MIN || plan.ceiling > AV_LICENCE_PER_MIN) {
    throw new Error(
      `AV budget worst case is ${plan.worstCase}/min, above the ${AV_LICENCE_PER_MIN}/min licence. AV_BUDGET_MODE=${plan.mode} ceiling=${plan.ceiling} web fallback=${plan.webFallback} worker fallback=${plan.workerFallback} jarvis fallback=${plan.jarvisFallback}. Refusing to start.`,
    );
  }
  if (plan.jarvisFloor < AV_JARVIS_FALLBACK_PER_MIN) {
    throw new Error(
      `Jarvis shared floor is ${plan.jarvisFloor}/min, below ${AV_JARVIS_FALLBACK_PER_MIN}. AV_BUDGET_MODE=${plan.mode} ceiling=${plan.ceiling}. Refusing to start.`,
    );
  }
  return plan;
}

export function avBudgetPlanFromEnv(env: NodeJS.ProcessEnv = process.env): AvBudgetPlan {
  return refuseIllegalAvBudget(avBudgetPlanForMode(readAvBudgetMode(env)));
}

export function readAvProcessRole(env: NodeJS.ProcessEnv = process.env): AvProcessRole {
  const raw = (env.AV_PROCESS_ROLE ?? '').trim().toLowerCase();
  if (raw === 'worker' || raw === 'jarvis') return raw;
  if (raw === 'web' || raw === '') return 'web';
  throw new Error(`AV_PROCESS_ROLE=${raw} is not web, worker, or jarvis. Refusing to start.`);
}

let activePlan = avBudgetPlanFromEnv();
let roleOverride: AvProcessRole | null = null;
// A bad AV_PROCESS_ROLE fails at startup. Unset stays web until an entrypoint sets it.
if ((process.env.AV_PROCESS_ROLE ?? '').trim() !== '') readAvProcessRole();

export function currentAvBudgetPlan(): AvBudgetPlan {
  return activePlan;
}

export function currentAvProcessRole(): AvProcessRole {
  return roleOverride ?? readAvProcessRole();
}

/** Test hook. Reloads the plan from an env object and throws on an illegal budget. */
export function applyAvBudgetForTests(env: NodeJS.ProcessEnv): AvBudgetPlan {
  activePlan = avBudgetPlanFromEnv(env);
  return activePlan;
}

/** Test hook. The running process, not the feature name, picks the fallback. */
export function applyAvProcessRoleForTests(role: AvProcessRole | null): void {
  roleOverride = role;
}

export const AV_ALLOWANCE_SUM = avBudgetPlanForMode('split').worstCase;

export const AV_BUDGET_CONTRACT = {
  method: 'POST',
  path: AV_BUDGET_PATH,
  auth: 'x-cron-secret (same value as CRON_SECRET)',
  body: { lane: 'backfill', feature: 'jarvis-overnight', count: 1 },
  countMax: 20,
  granted: { granted: 1, ceiling: AV_CEILING_PER_MIN, lane: 'backfill', feature: 'jarvis-overnight', retryAfterMs: 0 },
  note: 'Take one token per Alpha Vantage HTTP call. Do not call Alpha Vantage when granted is 0. The Jarvis process sets AV_PROCESS_ROLE=jarvis. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN put it on the shared window. Without them the Jarvis process uses its 120/min fallback. Posting feature=jarvis-overnight to this web route does not.',
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

/** One explicit lane for a cron, job, or worker entry. A lane already set by the caller stays. */
export function ensureAvLane<T>(budget: AvBudget, fn: () => T): T {
  if (currentAvBudget()) return fn();
  return runWithAvBudget(budget, fn);
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

export function decideAvTake(input: {
  lane: AvLane;
  usedTotal: number;
  usedByLane: Partial<Record<AvLane, number>>;
  ceiling?: number;
  reserve?: Record<AvLane, number>;
}): { allow: boolean; mustLeave: number } {
  const plan = currentAvBudgetPlan();
  const ceiling = input.ceiling ?? plan.ceiling;
  const reserve = input.reserve ?? plan.reserves;
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
let pendingFallbackCode: AvFallbackCode = 'absent';
const fallbackCounts: Record<AvFallbackCode, number> = { timeout: 0, error: 0, absent: 0 };

/** This process's fallback. The feature name is ignored on purpose. */
export function fallbackBudget(role: AvProcessRole = currentAvProcessRole()): { ceiling: number; reserve: Record<AvLane, number> } {
  const plan = currentAvBudgetPlan();
  if (role === 'jarvis') {
    return {
      ceiling: plan.jarvisFallback,
      reserve: { user: 0, alerts: 0, scheduled: 0, backfill: plan.jarvisFallback },
    };
  }
  if (role === 'worker') {
    return {
      ceiling: plan.workerFallback,
      reserve: { user: 0, alerts: 0, scheduled: plan.workerFallback, backfill: 0 },
    };
  }
  return { ceiling: plan.webFallback, reserve: reservesForCeiling(plan.webFallback, plan.reserves, plan.ceiling) };
}

function redisFailureCode(err: unknown): AvFallbackCode {
  const name = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  if (/timeout|aborted|abort/i.test(name)) return 'timeout';
  return 'error';
}

function noteFallback(code: AvFallbackCode, now: number, ceiling: number): void {
  fallbackCounts[code] += 1;
  if (now - lastFallbackLog < AV_FALLBACK_LOG_EVERY_MS) return;
  lastFallbackLog = now;
  console.warn(
    `[avLimiter] fallback rate timeout=${fallbackCounts.timeout} error=${fallbackCounts.error} absent=${fallbackCounts.absent} cap=${ceiling} role=${currentAvProcessRole()}`,
  );
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
}

/** Test hook. Clears the in-process window and the fallback log clock. */
export function resetAvLimiterLocalForTests(): void {
  localEvents.length = 0;
  lastFallbackLog = 0;
  pendingFallbackCode = 'absent';
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
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

function tryLocal(lane: AvLane, now: number): boolean {
  const budget = fallbackBudget();
  noteFallback(pendingFallbackCode, now, budget.ceiling);
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

function limiterRedis() {
  try {
    const getter = redisModule.getLimiterRedis;
    return typeof getter === 'function' ? getter() : null;
  } catch {
    return null;
  }
}

async function tryRedis(budget: AvBudget, now: number): Promise<boolean | null> {
  const plan = currentAvBudgetPlan();
  const redis = limiterRedis();
  if (!redis) {
    pendingFallbackCode = 'absent';
    return null;
  }
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}:${budget.lane}:${budget.feature}`;
  try {
    return await limiterTimeout((async () => {
      if (typeof redis.eval === 'function') {
        const granted = await redis.eval(
          AV_LIMITER_LUA,
          [REDIS_KEY],
          [String(now), String(WINDOW_MS), String(plan.ceiling), budget.lane, member, JSON.stringify(plan.reserves), JSON.stringify(AV_LANES)],
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
      if ((used ?? 0) > plan.ceiling) {
        await redis.zrem(REDIS_KEY, member);
        return false;
      }
      return true;
    })());
  } catch (err) {
    pendingFallbackCode = redisFailureCode(err);
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
