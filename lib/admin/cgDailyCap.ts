import { getRedis } from '@/lib/redis';

/**
 * Hard daily gate for CoinGecko. The monthly target is CG_MONTHLY_CREDITS * CG_TARGET_PCT
 * (defaults 500000 and 80). Each UTC day may spend
 *   (quota * target - used at the start of that UTC day) / days left in the month,
 * including today. That cap is recomputed when the cached /key snapshot refreshes
 * (10 minutes, same key cgBudgetStatus writes). used-at-start is fixed for the UTC day.
 * If /key is unavailable, the day gets the flat share quota * target / days in the month.
 * A paced cap already computed today is kept while /key is merely between refreshes,
 * so a stale snapshot cannot raise the cap.
 *
 * Enforcement is an atomic per-UTC-day Redis counter: INCR before the HTTP call, and
 * refuse with CG_MONTHLY_CAP when the result is over the cap. Nothing is queued.
 *
 * Redis-down fallback (same rule as the Alpha Vantage limiter):
 * The reservation aborts after 400ms. A timeout, a Redis error, or no Redis client
 * uses this process's fallback. A cap denial does not: that call is refused.
 * The web service, the data worker, and a Jarvis cron can call CoinGecko, and a
 * second web instance may exist. CG_ESTIMATED_PROCESSES (default 4) overestimates
 * that set. Each process then counts alone, at floor(flat daily cap / N), remainder
 * dropped. The counter resets at the UTC day boundary and does not survive a restart.
 * A timeout can still land on the server and on this process counter together.
 * The fallback log is a count of codes (timeout, error, absent), once per 5 minutes.
 */
export const CG_REDIS_PREFIX = 'admin:cg-credits:v1';
export const CG_ESTIMATED_PROCESSES_DEFAULT = 4;
/** Same 400ms bound the AV limiter uses for its Redis commands. */
export const CG_LIMITER_REDIS_TIMEOUT_MS = 400;
const KEY_FRESH_MS = 600_000;
const COUNTER_TTL_SECONDS = 8 * 86400;
const LOG_EVERY_MS = 5 * 60 * 1000;

const RESERVE_LUA = `
local cap = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ttl) end
if cap == nil or n > cap then
  redis.call('DECR', KEYS[1])
  local r = redis.call('INCR', KEYS[2])
  if r == 1 then redis.call('EXPIRE', KEYS[2], ttl) end
  return {'cg', 0, n - 1, r}
end
local refused = tonumber(redis.call('GET', KEYS[2]) or '0')
return {'cg', 1, n, refused}
`;

export class CgMonthlyCapError extends Error {
  readonly code = 'CG_MONTHLY_CAP' as const;
  constructor() {
    super('CG_MONTHLY_CAP');
    this.name = 'CgMonthlyCapError';
  }
}

export function isCgMonthlyCap(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; name?: unknown; message?: unknown };
  return value.code === 'CG_MONTHLY_CAP' || value.name === 'CgMonthlyCapError' || value.message === 'CG_MONTHLY_CAP';
}

export function cgQuota(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CG_MONTHLY_CREDITS);
  return Number.isFinite(n) && n > 0 ? n : 500_000;
}

/** Integer percent. 80 means 80% of the monthly quota. */
export function cgTargetPct(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CG_TARGET_PCT);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 80;
}

export function cgEstimatedProcesses(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CG_ESTIMATED_PROCESSES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : CG_ESTIMATED_PROCESSES_DEFAULT;
}

export function utcMonthParts(now: number): { daysInMonth: number; daysLeft: number; day: string; month: string } {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  return {
    daysInMonth,
    daysLeft,
    day: date.toISOString().slice(0, 10),
    month: date.toISOString().slice(0, 7),
  };
}

/** Spread the credits still under the monthly target across the days left, including today. */
export function pacedDailyCap(quota: number, targetPct: number, usedAtStartOfDay: number, daysLeft: number): number {
  if (!(quota > 0) || !(targetPct > 0) || !(daysLeft > 0)) return 0;
  const room = quota * (targetPct / 100) - usedAtStartOfDay;
  if (!(room > 0)) return 0;
  return Math.floor(room / daysLeft);
}

/** Used when /key cannot say how much of the month is already spent. */
export function flatDailyCap(quota: number, targetPct: number, daysInMonth: number): number {
  if (!(quota > 0) || !(targetPct > 0) || !(daysInMonth > 0)) return 0;
  return Math.floor((quota * (targetPct / 100)) / daysInMonth);
}

/** Floor division. A remainder is dropped so N processes cannot add up to more than the flat cap. */
export function perProcessDailyCap(flatCap: number, processes: number): number {
  const count = Number.isFinite(processes) && processes >= 1 ? Math.floor(processes) : CG_ESTIMATED_PROCESSES_DEFAULT;
  if (!(flatCap > 0)) return 0;
  return Math.floor(flatCap / count);
}

type StoredStart = { used: number; snapshotAt: string | null };
type StoredCap = { cap: number; mode: 'paced' | 'flat'; snapshotAt: string | null };
type KeySnapshot = { at: string; key: { current_total_monthly_calls?: number; monthly_call_credit?: number; plan?: string } };

export type CapPlan = {
  cap: number;
  mode: 'paced' | 'flat' | 'process';
  usedAtStart: number | null;
  day: string;
  quota: number;
  targetPct: number;
  callsToday: number;
  refusedToday: number;
};

export type CgCapFields = {
  quota: number;
  targetPct: number;
  targetCredits: number;
  todayCap: number;
  callsToday: number;
  refusedToday: number;
  capMode: CapPlan['mode'];
};

const memory = { day: '', allowed: 0, refused: 0 };
let lastBudgetLogAt = 0;
type FallbackCode = 'timeout' | 'error' | 'absent';
const fallbackCounts: Record<FallbackCode, number> = { timeout: 0, error: 0, absent: 0 };
let lastFallbackLogAt = 0;

export function resetCgCapStateForTests(): void {
  memory.day = '';
  memory.allowed = 0;
  memory.refused = 0;
  lastBudgetLogAt = 0;
  lastFallbackLogAt = 0;
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asCount(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

function noteBudgetLine(calls: number, cap: number, refused: number, now: number): void {
  if (lastBudgetLogAt === 0) {
    lastBudgetLogAt = now;
    return;
  }
  if (now - lastBudgetLogAt < LOG_EVERY_MS) return;
  lastBudgetLogAt = now;
  console.log(`[CoinGecko] budget calls_today=${calls} cap=${cap} refused=${refused}`);
}

function rollMemory(day: string): void {
  if (memory.day !== day) {
    memory.day = day;
    memory.allowed = 0;
    memory.refused = 0;
  }
}

function takeMemorySlot(cap: number, day: string): { ok: boolean; calls: number; refused: number } {
  rollMemory(day);
  if (memory.allowed >= cap) {
    memory.refused += 1;
    return { ok: false, calls: memory.allowed, refused: memory.refused };
  }
  memory.allowed += 1;
  return { ok: true, calls: memory.allowed, refused: memory.refused };
}

function capTuple(raw: unknown): { ok: boolean; calls: number; refused: number } | null {
  if (!Array.isArray(raw) || raw.length < 4 || raw[0] !== 'cg') return null;
  const flag = Number(raw[1]);
  if (flag !== 0 && flag !== 1) return null;
  if (!Number.isFinite(Number(raw[2])) || !Number.isFinite(Number(raw[3]))) return null;
  return { ok: flag === 1, calls: asCount(raw[2]), refused: asCount(raw[3]) };
}

async function reserveShared(redis: NonNullable<ReturnType<typeof getRedis>>, cap: number, day: string): Promise<{ ok: boolean; calls: number; refused: number }> {
  const countKey = `${CG_REDIS_PREFIX}:cap-count:${day}`;
  const refusedKey = `${CG_REDIS_PREFIX}:cap-refused:${day}`;
  if (typeof redis.eval === 'function') {
    try {
      const parsed = capTuple(await redis.eval(RESERVE_LUA, [countKey, refusedKey], [cap, COUNTER_TTL_SECONDS]));
      if (parsed) return parsed;
    } catch {
      // Fall through to INCR. A thrown eval is a Redis failure, not a cap hit.
    }
  }
  if (typeof redis.incr !== 'function') {
    throw new Error('cg cap redis incr unavailable');
  }
  const n = asCount(await redis.incr(countKey));
  if (n === 1 && typeof redis.expire === 'function') await redis.expire(countKey, COUNTER_TTL_SECONDS).catch(() => undefined);
  if (n > cap) {
    if (typeof redis.decr === 'function') await redis.decr(countKey);
    const refused = asCount(await redis.incr(refusedKey));
    if (refused === 1 && typeof redis.expire === 'function') await redis.expire(refusedKey, COUNTER_TTL_SECONDS).catch(() => undefined);
    return { ok: false, calls: Math.max(0, n - 1), refused };
  }
  const refused = asCount(await redis.get(refusedKey).catch(() => 0));
  return { ok: true, calls: n, refused };
}

async function readCounters(redis: NonNullable<ReturnType<typeof getRedis>>, day: string): Promise<{ calls: number; refused: number }> {
  const [calls, refused] = await Promise.all([
    redis.get(`${CG_REDIS_PREFIX}:cap-count:${day}`).catch(() => 0),
    redis.get(`${CG_REDIS_PREFIX}:cap-refused:${day}`).catch(() => 0),
  ]);
  return { calls: asCount(calls), refused: asCount(refused) };
}

/** Reads the /key snapshot and the local month counter. Does not call CoinGecko. */
export async function planDailyCap(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<CapPlan> {
  const quota = cgQuota(env);
  const targetPct = cgTargetPct(env);
  const { daysInMonth, daysLeft, day, month } = utcMonthParts(now);
  const flat = flatDailyCap(quota, targetPct, daysInMonth);
  const redis = getRedis();
  if (!redis) {
    rollMemory(day);
    return {
      cap: perProcessDailyCap(flat, cgEstimatedProcesses(env)),
      mode: 'process',
      usedAtStart: null,
      day,
      quota,
      targetPct,
      callsToday: memory.allowed,
      refusedToday: memory.refused,
    };
  }

  const snapshot = await redis.get<KeySnapshot>(`${CG_REDIS_PREFIX}:key`).catch(() => null);
  const fresh = snapshot && Number.isFinite(Date.parse(snapshot.at)) && now - Date.parse(snapshot.at) <= KEY_FRESH_MS ? snapshot : null;
  const localMonth = asCount(await redis.get(`${CG_REDIS_PREFIX}:month:${month}`).catch(() => 0));
  const startKey = `${CG_REDIS_PREFIX}:day-start:${day}`;
  const capKey = `${CG_REDIS_PREFIX}:day-cap:${day}`;
  let usedAtStart: number | null = null;
  let cap = flat;
  let mode: 'paced' | 'flat' = 'flat';

  if (fresh) {
    const storedStart = await redis.get<StoredStart>(startKey).catch(() => null);
    if (storedStart && typeof storedStart.used === 'number' && Number.isFinite(storedStart.used)) {
      usedAtStart = storedStart.used;
    } else {
      usedAtStart = finiteNumber(fresh.key?.current_total_monthly_calls) ?? localMonth;
      const start: StoredStart = { used: usedAtStart, snapshotAt: fresh.at };
      await redis.set(startKey, start, { ex: 40 * 86400 }).catch(() => undefined);
    }
    const storedCap = await redis.get<StoredCap>(capKey).catch(() => null);
    if (storedCap && storedCap.mode === 'paced' && storedCap.snapshotAt === fresh.at && Number.isFinite(storedCap.cap)) {
      cap = storedCap.cap;
    } else {
      cap = pacedDailyCap(quota, targetPct, usedAtStart, daysLeft);
      const next: StoredCap = { cap, mode: 'paced', snapshotAt: fresh.at };
      await redis.set(capKey, next, { ex: 40 * 86400 }).catch(() => undefined);
    }
    mode = 'paced';
  } else {
    const storedCap = await redis.get<StoredCap>(capKey).catch(() => null);
    if (storedCap && storedCap.mode === 'paced' && Number.isFinite(storedCap.cap)) {
      cap = storedCap.cap;
      mode = 'paced';
      const storedStart = await redis.get<StoredStart>(startKey).catch(() => null);
      usedAtStart = storedStart && typeof storedStart.used === 'number' ? storedStart.used : null;
    } else {
      cap = flat;
      mode = 'flat';
    }
  }

  const counts = await readCounters(redis, day);
  return { cap, mode, usedAtStart, day, quota, targetPct, callsToday: counts.calls, refusedToday: counts.refused };
}

export async function capFields(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<CgCapFields> {
  const plan = await planDailyCap(now, env);
  return {
    quota: plan.quota,
    targetPct: plan.targetPct,
    targetCredits: Math.floor(plan.quota * (plan.targetPct / 100)),
    todayCap: plan.cap,
    callsToday: plan.callsToday,
    refusedToday: plan.refusedToday,
    capMode: plan.mode,
  };
}

function redisFailureCode(err: unknown): FallbackCode {
  const name = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  if (/timeout|aborted|abort/i.test(name)) return 'timeout';
  return 'error';
}

function noteFallback(code: FallbackCode, now: number, cap: number): void {
  fallbackCounts[code] += 1;
  if (now - lastFallbackLogAt < LOG_EVERY_MS) return;
  lastFallbackLogAt = now;
  console.warn(
    `[CoinGecko] fallback timeout=${fallbackCounts.timeout} error=${fallbackCounts.error} absent=${fallbackCounts.absent} cap=${cap}`,
  );
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
}

function limiterTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('CG cap Redis timeout')), CG_LIMITER_REDIS_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Reserve one CoinGecko HTTP attempt. Throws CG_MONTHLY_CAP when today's cap is
 * already spent. Does not fetch, sleep, or queue. Redis work aborts after 400ms;
 * timeout or error uses the in-process fallback. A denial does not.
 */
export async function reserveCgCall(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<void> {
  const quota = cgQuota(env);
  const targetPct = cgTargetPct(env);
  const { daysInMonth, day } = utcMonthParts(now);
  const processCap = perProcessDailyCap(flatDailyCap(quota, targetPct, daysInMonth), cgEstimatedProcesses(env));
  const redis = getRedis();

  const finish = (slot: { ok: boolean; calls: number; refused: number }, cap: number) => {
    noteBudgetLine(slot.calls, cap, slot.refused, now);
    if (!slot.ok) throw new CgMonthlyCapError();
  };

  if (!redis) {
    noteFallback('absent', now, processCap);
    finish(takeMemorySlot(processCap, day), processCap);
    return;
  }

  try {
    const reserved = await limiterTimeout((async () => {
      const plan = await planDailyCap(now, env);
      return { cap: plan.cap, slot: await reserveShared(redis, plan.cap, plan.day) };
    })());
    finish(reserved.slot, reserved.cap);
  } catch (error) {
    if (isCgMonthlyCap(error)) throw error;
    noteFallback(redisFailureCode(error), now, processCap);
    finish(takeMemorySlot(processCap, day), processCap);
  }
}
