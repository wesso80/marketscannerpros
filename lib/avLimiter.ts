/**
 * Shared Alpha Vantage limiter for web, worker, and the Jarvis cron.
 *
 * Licence is 600 calls/min. AV_BUDGET_MODE picks the split. AV_PROCESS_ROLE
 * picks this process's fallback. A feature name does not.
 *
 * Worst case is additive in both modes. A Redis timeout can land server-side
 * and on the process fallback at the same time:
 *   split: 300 + 80 web + 100 worker + 120 Jarvis = 600
 *   540:   540 + 20 web + 20 worker + 20 Jarvis = 600
 * Startup throws if that sum is above 600. The message names AV_BUDGET_MODE.
 *
 * Lane reserves on the shared pool are minimums, not caps. Any lane may use
 * spare capacity up to the ceiling.
 *   split: user 50, alerts 30, scheduled 100, backfill 120
 *   Jarvis shared floor: 300 - (50 + 30 + 100) = 120
 *   540 scales those by 540/300: user 90, alerts 54, scheduled 180, backfill 216
 *   Jarvis shared floor: 540 - (90 + 54 + 180) = 216
 * The user floor (50 in split, 90 in 540) is always reserved, even when the
 * user lane has not called. alerts and scheduled stay active for 120s after
 * their last granted call, via a per-lane key set in the same Lua script.
 * Backfill is active only while the Jarvis heartbeat key is present. Any
 * other idle floor is spare, including the whole Jarvis floor when the
 * heartbeat is absent. A take is allowed when used + 1 + the other active
 * lanes' unmet floors (floor minus used) is within the ceiling. The script
 * reads Redis TIME for the window, not the client clock.
 * Web fallback holds nothing for backfill. It splits across user, alerts, and
 * scheduled. Worker fallback is all scheduled. Jarvis fallback is all backfill.
 *
 * Untagged calls are the user lane (a page request). Cron routes, job routes,
 * and the worker pass their lane. AV_PROCESS_ROLE is set by the worker and
 * Jarvis entrypoints, so Render does not need a new env var. Joining the
 * shared window needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 *
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
/** Shared-pool Jarvis floor, and the split-mode Jarvis process fallback. */
export const AV_JARVIS_FALLBACK_PER_MIN = 120;
/** Each process fallback in 540 mode. Counted on top of the 540 ceiling. */
export const AV_540_FALLBACK_PER_MIN = 20;
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
 * Split minimums. They fill the 300 pool: 50 + 30 + 100 + 120.
 * Backfill stays available when the other three sit on their minimums.
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

export function additiveAvWorstCase(plan: Pick<AvBudgetPlan, 'ceiling' | 'webFallback' | 'workerFallback' | 'jarvisFallback'>): number {
  return plan.ceiling + plan.webFallback + plan.workerFallback + plan.jarvisFallback;
}

export function avBudgetPlanForMode(mode: AvBudgetMode): AvBudgetPlan {
  if (mode === '540') {
    const ceiling = AV_540_CEILING_PER_MIN;
    const reserves = reservesForCeiling(ceiling);
    const webFallback = AV_540_FALLBACK_PER_MIN;
    const workerFallback = AV_540_FALLBACK_PER_MIN;
    const jarvisFallback = AV_540_FALLBACK_PER_MIN;
    return {
      mode,
      ceiling,
      reserves,
      webFallback,
      workerFallback,
      jarvisFallback,
      worstCase: ceiling + webFallback + workerFallback + jarvisFallback,
      jarvisFloor: jarvisSharedFloor(ceiling, reserves),
    };
  }
  const ceiling = AV_SPLIT_CEILING_PER_MIN;
  const reserves = { ...AV_LANE_RESERVE };
  const webFallback = AV_WEB_FALLBACK_PER_MIN;
  const workerFallback = AV_WORKER_FALLBACK_PER_MIN;
  const jarvisFallback = AV_JARVIS_FALLBACK_PER_MIN;
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
  const additive = additiveAvWorstCase(plan);
  const worstCase = Math.max(additive, plan.worstCase);
  if (worstCase > AV_LICENCE_PER_MIN || plan.ceiling > AV_LICENCE_PER_MIN) {
    throw new Error(
      `AV budget worst case is ${worstCase}/min (ceiling ${plan.ceiling} + web fallback ${plan.webFallback} + worker fallback ${plan.workerFallback} + jarvis fallback ${plan.jarvisFallback}), above the ${AV_LICENCE_PER_MIN}/min licence. AV_BUDGET_MODE=${plan.mode}. Refusing to start.`,
    );
  }
  if (plan.jarvisFloor < AV_JARVIS_FALLBACK_PER_MIN) {
    throw new Error(
      `Jarvis shared-pool floor is ${plan.jarvisFloor}/min, below ${AV_JARVIS_FALLBACK_PER_MIN}. AV_BUDGET_MODE=${plan.mode} ceiling=${plan.ceiling}. The process fallback is not part of this check. Refusing to start.`,
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
  note: 'Take one token per Alpha Vantage HTTP call. Do not call Alpha Vantage when granted is 0. The Jarvis script sets AV_PROCESS_ROLE=jarvis and the worker sets AV_PROCESS_ROLE=worker. No Render env change is required for the role. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN put the process on the shared window. Without them the process uses its own fallback (120/min for Jarvis in split, 20/min in 540 mode). Posting feature=jarvis-overnight to the web route does not.',
} as const;

const REDIS_KEY = 'av_limiter:minute';
const WINDOW_MS = 60_000;
/** Present only while scripts/jarvis-overnight-scan.ts is inside a run. */
export const AV_JARVIS_HEARTBEAT_KEY = 'av_limiter:jarvis';
export const AV_JARVIS_HEARTBEAT_TTL_SEC = 90;
export const AV_JARVIS_HEARTBEAT_EVERY_MS = 30_000;
/** alerts and scheduled keep their floor for this long after the last granted call. */
export const AV_LANE_ACTIVE_MS = 120_000;

export function avLaneLastUsedKey(lane: 'alerts' | 'scheduled'): string {
  return `av_limiter:last:${lane}`;
}

/** KEYS for AV_LIMITER_LUA. The last-used keys are written inside that script. */
export function avLimiterEvalKeys(): string[] {
  return [REDIS_KEY, AV_JARVIS_HEARTBEAT_KEY, avLaneLastUsedKey('alerts'), avLaneLastUsedKey('scheduled')];
}

export function avLimiterEvalArgv(input: {
  ceiling: number;
  lane: AvLane;
  member: string;
  reserves: Record<AvLane, number>;
}): string[] {
  return [
    String(WINDOW_MS),
    String(input.ceiling),
    input.lane,
    input.member,
    JSON.stringify(input.reserves),
    JSON.stringify(AV_LANES),
    String(AV_LANE_ACTIVE_MS),
  ];
}

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

/**
 * user is always reserved. alerts and scheduled are reserved while they have
 * used a call this minute or their 120s last-used mark is still set. Backfill
 * is reserved only while the Jarvis heartbeat is present.
 */
function laneFloorIsHeld(
  lane: AvLane,
  used: number,
  floor: number,
  jarvisActive: boolean,
  recentlyActive: boolean,
): boolean {
  if (floor <= 0) return false;
  if (lane === 'user') return true;
  if (lane === 'backfill') return jarvisActive;
  return used > 0 || recentlyActive;
}

export function decideAvTake(input: {
  lane: AvLane;
  usedTotal: number;
  usedByLane: Partial<Record<AvLane, number>>;
  ceiling?: number;
  reserve?: Record<AvLane, number>;
  jarvisActive?: boolean;
  /** alerts/scheduled still inside the 120s window after their last granted call. */
  laneActive?: Partial<Record<AvLane, boolean>>;
}): { allow: boolean; mustLeave: number } {
  const plan = currentAvBudgetPlan();
  const ceiling = input.ceiling ?? plan.ceiling;
  const reserve = input.reserve ?? plan.reserves;
  const jarvisActive = input.jarvisActive === true;
  let mustLeave = 0;
  for (const other of AV_LANES) {
    if (other === input.lane) continue;
    const used = input.usedByLane[other] ?? 0;
    const floor = reserve[other] ?? 0;
    if (!laneFloorIsHeld(other, used, floor, jarvisActive, input.laneActive?.[other] === true)) continue;
    mustLeave += Math.max(0, floor - used);
  }
  return { allow: input.usedTotal + 1 + mustLeave <= ceiling, mustLeave };
}

export const AV_LIMITER_LUA = `
local key = KEYS[1]
local heartbeat = KEYS[2]
local alertsLast = KEYS[3]
local scheduledLast = KEYS[4]
local windowMs = tonumber(ARGV[1])
local ceiling = tonumber(ARGV[2])
local lane = ARGV[3]
local member = ARGV[4]
local reserves = cjson.decode(ARGV[5])
local order = cjson.decode(ARGV[6])
local activeMs = tonumber(ARGV[7])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local function fresh(lastKey)
  local raw = redis.call('GET', lastKey)
  if raw == false or raw == nil then return false end
  local at = tonumber(raw)
  if at == nil then return false end
  return now - at < activeMs
end
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local rows = redis.call('ZRANGE', key, 0, -1)
local used = {}
for _, name in ipairs(order) do used[name] = 0 end
local total = #rows
for _, m in ipairs(rows) do
  local l = string.match(m, '^%d+:[^:]+:([^:]+):')
  if l and used[l] ~= nil then used[l] = used[l] + 1 end
end
local hb = redis.call('GET', heartbeat)
local jarvisActive = hb ~= false and hb ~= nil
local alertsRecent = fresh(alertsLast)
local scheduledRecent = fresh(scheduledLast)
local mustLeave = 0
for _, name in ipairs(order) do
  if name ~= lane then
    local count = used[name] or 0
    local floor = reserves[name] or 0
    local reserved = false
    if floor > 0 then
      if name == 'user' then reserved = true
      elseif name == 'backfill' then reserved = jarvisActive
      elseif name == 'alerts' then reserved = count > 0 or alertsRecent
      elseif name == 'scheduled' then reserved = count > 0 or scheduledRecent
      end
    end
    if reserved then
      local left = floor - count
      if left > 0 then mustLeave = mustLeave + left end
    end
  end
end
if total + 1 + mustLeave > ceiling then return 0 end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, 70)
if lane == 'alerts' then redis.call('SET', alertsLast, tostring(now), 'PX', activeMs) end
if lane == 'scheduled' then redis.call('SET', scheduledLast, tostring(now), 'PX', activeMs) end
return 1
`;

type LocalEvent = { at: number; lane: AvLane };
const localEvents: LocalEvent[] = [];
const localLastUsed: Partial<Record<AvLane, number>> = {};
let lastFallbackLog = 0;
let pendingFallbackCode: AvFallbackCode = 'absent';
const fallbackCounts: Record<AvFallbackCode, number> = { timeout: 0, error: 0, absent: 0 };

function emptyReserve(): Record<AvLane, number> {
  return { user: 0, alerts: 0, scheduled: 0, backfill: 0 };
}

/** Web fallback weights. Backfill is 0 because Jarvis never runs on the web process. */
const WEB_FALLBACK_WEIGHTS: Record<AvLane, number> = { user: 50, alerts: 30, scheduled: 100, backfill: 0 };
const WEB_FALLBACK_WEIGHT_SUM = 180;

export function webFallbackReserve(amount: number): Record<AvLane, number> {
  return reservesForCeiling(amount, WEB_FALLBACK_WEIGHTS, WEB_FALLBACK_WEIGHT_SUM);
}

/**
 * This process's fallback. The feature name is ignored on purpose.
 * Web splits its fallback across user, alerts, and scheduled only.
 * Worker stays on scheduled and Jarvis stays on backfill.
 */
export function fallbackBudget(role: AvProcessRole = currentAvProcessRole()): { ceiling: number; reserve: Record<AvLane, number> } {
  const plan = currentAvBudgetPlan();
  if (role === 'jarvis') {
    const reserve = emptyReserve();
    reserve.backfill = plan.jarvisFallback;
    return { ceiling: plan.jarvisFallback, reserve };
  }
  if (role === 'worker') {
    const reserve = emptyReserve();
    reserve.scheduled = plan.workerFallback;
    return { ceiling: plan.workerFallback, reserve };
  }
  return { ceiling: plan.webFallback, reserve: webFallbackReserve(plan.webFallback) };
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
  for (const lane of AV_LANES) delete localLastUsed[lane];
  lastFallbackLog = 0;
  pendingFallbackCode = 'absent';
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
}

function recentLaneActive(now: number): Partial<Record<AvLane, boolean>> {
  const active: Partial<Record<AvLane, boolean>> = {};
  for (const lane of ['alerts', 'scheduled'] as const) {
    const at = localLastUsed[lane];
    if (at != null && now - at < AV_LANE_ACTIVE_MS) active[lane] = true;
  }
  return active;
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
    jarvisActive: currentAvProcessRole() === 'jarvis',
    laneActive: recentLaneActive(now),
  });
  if (!decision.allow) return false;
  localEvents.push({ at: now, lane });
  if (lane === 'alerts' || lane === 'scheduled') localLastUsed[lane] = now;
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

/** Refreshed by the Jarvis script for the length of a run. A missed refresh expires the floor. */
export async function touchJarvisHeartbeat(): Promise<void> {
  const redis = limiterRedis();
  if (!redis || typeof redis.set !== 'function') return;
  try {
    await limiterTimeout(Promise.resolve(redis.set(AV_JARVIS_HEARTBEAT_KEY, '1', { ex: AV_JARVIS_HEARTBEAT_TTL_SEC })));
  } catch {
    // The previous TTL still covers a missed refresh. When it expires the floor is lendable.
  }
}

export async function clearJarvisHeartbeat(): Promise<void> {
  const redis = limiterRedis();
  if (!redis || typeof redis.del !== 'function') return;
  try {
    await limiterTimeout(Promise.resolve(redis.del(AV_JARVIS_HEARTBEAT_KEY)));
  } catch {
    // The TTL releases the floor if the delete does not land.
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
          avLimiterEvalKeys(),
          avLimiterEvalArgv({ ceiling: plan.ceiling, lane: budget.lane, member, reserves: plan.reserves }),
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
      const hb = typeof redis.get === 'function' ? await redis.get(AV_JARVIS_HEARTBEAT_KEY) : null;
      const laneActive: Partial<Record<AvLane, boolean>> = {};
      if (typeof redis.get === 'function') {
        for (const watched of ['alerts', 'scheduled'] as const) {
          const raw = await redis.get(avLaneLastUsedKey(watched));
          const at = Number(raw);
          if (raw != null && raw !== false && Number.isFinite(at) && now - at < AV_LANE_ACTIVE_MS) laneActive[watched] = true;
        }
      }
      const decision = decideAvTake({
        lane: budget.lane,
        usedTotal: rows.length,
        usedByLane,
        jarvisActive: hb != null && hb !== false,
        laneActive,
      });
      if (!decision.allow) return false;
      await redis.zadd(REDIS_KEY, { score: now, member });
      await redis.expire(REDIS_KEY, 70);
      const used = await redis.zcard(REDIS_KEY);
      if ((used ?? 0) > plan.ceiling) {
        await redis.zrem(REDIS_KEY, member);
        return false;
      }
      if ((budget.lane === 'alerts' || budget.lane === 'scheduled') && typeof redis.set === 'function') {
        await redis.set(avLaneLastUsedKey(budget.lane), String(now), { px: AV_LANE_ACTIVE_MS });
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
