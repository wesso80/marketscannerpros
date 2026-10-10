import * as redisModule from '@/lib/redis';
import { currentAvBudget } from '@/lib/avLimiter';
import { formatCgCallerCounts, readCgCallerCounts } from '@/lib/admin/cgCallers';

/**
 * Hard daily gate for CoinGecko. The monthly target is CG_MONTHLY_CREDITS * CG_TARGET_PCT
 * (defaults 500000 and 80). Each UTC day may spend
 *   (quota * target - used at the start of that UTC day) / days left in the month,
 * including today. used-at-start is fixed for the UTC day. A stale /key snapshot
 * cannot raise a paced cap already sealed today. If /key is unavailable, the day
 * gets the flat share quota * target / days in the month.
 *
 * The reserve hot path is one EVAL on getLimiterRedis() (one client, no retries,
 * 400ms abort). The script seals the cap and increments the ledger. The 400ms
 * race stays because that is enough for one round trip; the old timeout fired
 * while planDailyCap issued several sequential calls on the retrying cache client.
 *
 * The sealed cap is min(that budget, CG_DAILY_HARD_MAX). The default is 16500.
 * A ledger already sealed higher is lowered on the next EVAL.
 *
 * An unconfirmed reserve (timeout, error, no client, undecoded reply) does not
 * spend process memory. Jobs and crons fail closed. A user-facing read may take
 * one credit from the shared web shelf,
 * floor(min(flat cap, CG_DAILY_HARD_MAX) / (processes * 4)),
 * stored in Postgres so a restart does not mint a new share. If that charge
 * cannot be confirmed, the read is refused and cgFetch serves cache.
 */
export const CG_REDIS_PREFIX = 'admin:cg-credits:v1';
export const CG_ESTIMATED_PROCESSES_DEFAULT = 4;
/** Same 400ms bound the AV limiter uses. One aborted command, not a retry budget. */
export const CG_LIMITER_REDIS_TIMEOUT_MS = 400;
/** Postgres shelf charge. Only the outage path waits this long. */
export const CG_SHELF_WAIT_MS = 1_000;
const KEY_FRESH_MS = 600_000;
const COUNTER_TTL_SECONDS = 8 * 86400;
const LOG_EVERY_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const REDIS_BACKOFF_MS = 5_000;

const JOB_LANES = new Set(['alerts', 'scheduled', 'backfill']);

/**
 * Spec for CG_LEDGER_LUA. Tests run this function. Production runs the script.
 * Both must keep used-at-start fixed for the UTC day, clamp the sealed cap to
 * ARGV[9], and refuse when issued would pass that cap.
 */
export const CG_LEDGER_LUA = `
local function n(v)
  if v == false or v == nil then return nil end
  return tonumber(v)
end
local function decode(raw)
  if raw == false or raw == nil then return nil end
  if type(raw) == 'table' then return raw end
  local ok, value = pcall(cjson.decode, raw)
  if ok and type(value) == 'table' then return value end
  return nil
end
local flatCap = n(ARGV[1]) or 0
local quota = n(ARGV[2]) or 0
local targetPct = n(ARGV[3]) or 0
local daysLeft = n(ARGV[4]) or 0
local nowMs = n(ARGV[5]) or 0
local freshMs = n(ARGV[6]) or 0
local ttl = n(ARGV[7]) or 0
local charge = n(ARGV[8]) or 0
local ledger = decode(redis.call('GET', KEYS[1])) or {}
local cap = n(ledger.cap) or 0
local mode = ledger.mode == 'paced' and 'paced' or 'flat'
local used = n(ledger.used)
if used ~= nil and used < 0 then used = nil end
local snapshotAt = ledger.snapshotAt
if snapshotAt == cjson.null then snapshotAt = nil end
local issued = n(ledger.issued) or 0
local refused = n(ledger.refused) or 0
local legacy = n(redis.call('GET', KEYS[3]))
if legacy ~= nil and legacy > issued then issued = legacy end
local snap = decode(redis.call('GET', KEYS[2]))
local freshAt, freshUsed = nil, nil
if snap ~= nil then
  local atMs = n(snap.atMs)
  if atMs ~= nil and nowMs >= atMs and (nowMs - atMs) <= freshMs then
    freshAt = snap.at or tostring(atMs)
    if type(snap.key) == 'table' then freshUsed = n(snap.key.current_total_monthly_calls) end
  end
end
local monthUsed = n(redis.call('GET', KEYS[4])) or 0
if freshAt ~= nil and mode == 'paced' and snapshotAt == freshAt then
elseif freshAt ~= nil then
  if used == nil then used = freshUsed or monthUsed end
  local room = quota * (targetPct / 100) - (used or 0)
  if room > 0 and daysLeft > 0 then
    cap = math.floor((quota * (targetPct / 100) - (used or 0)) / daysLeft)
  else
    cap = 0
  end
  mode = 'paced'
  snapshotAt = freshAt
elseif mode == 'paced' and ledger.cap ~= nil then
else
  cap = flatCap > 0 and math.floor(flatCap) or 0
  mode = 'flat'
  used = nil
  snapshotAt = nil
end
local hardMax = n(ARGV[9]) or 0
if hardMax > 0 and cap > hardMax then cap = math.floor(hardMax) end
local ok = 1
if charge == 1 then
  issued = issued + 1
  if cap == nil or issued > cap then
    issued = issued - 1
    refused = refused + 1
    ok = 0
  end
end
redis.call('SET', KEYS[1], cjson.encode({
  cap = cap,
  mode = mode,
  used = used == nil and -1 or used,
  snapshotAt = snapshotAt == nil and cjson.null or snapshotAt,
  issued = issued,
  refused = refused,
}), 'EX', ttl)
return {'cg', ok, issued, refused, cap, mode, used == nil and -1 or used}
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

/** Brad's rule. A paced catch-up day cannot admit more than this. */
export const CG_DAILY_HARD_MAX_DEFAULT = 16_500;

export function cgDailyHardMax(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CG_DAILY_HARD_MAX);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : CG_DAILY_HARD_MAX_DEFAULT;
}

/** Enforcement cap. pacedDailyCap stays the unclamped budget. */
export function clampDailyCap(budget: number, hardMax = CG_DAILY_HARD_MAX_DEFAULT): number {
  if (!(budget > 0)) return 0;
  const ceiling = Number.isFinite(hardMax) && hardMax > 0 ? Math.floor(hardMax) : CG_DAILY_HARD_MAX_DEFAULT;
  return Math.min(Math.floor(budget), ceiling);
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

/**
 * One share for the whole web fleet, not a fresh share per restart.
 * Pass the clamped flat cap. floor(dailyCap / (CG_ESTIMATED_PROCESSES * 4)).
 */
export function conservativeProcessShare(dailyCap: number, processes: number): number {
  const count = Number.isFinite(processes) && processes >= 1 ? Math.floor(processes) : CG_ESTIMATED_PROCESSES_DEFAULT;
  if (!(dailyCap > 0)) return 0;
  return Math.floor(dailyCap / (count * 4));
}

export type CgProcessRole = 'web' | 'worker' | 'jarvis';
export type CgDuty = 'user' | 'job';

export function cgProcessRole(env: Record<string, string | undefined> = process.env): CgProcessRole {
  const raw = (env.AV_PROCESS_ROLE ?? '').trim().toLowerCase();
  if (raw === 'worker' || raw === 'jarvis') return raw;
  return 'web';
}

/** Worker, Jarvis, and any AV lane other than a page request are jobs. */
export function cgDuty(env: Record<string, string | undefined> = process.env): CgDuty {
  const raw = (env.AV_PROCESS_ROLE ?? '').trim().toLowerCase();
  if (raw === 'worker' || raw === 'jarvis') return 'job';
  if (raw !== '' && raw !== 'web') return 'job';
  try {
    const lane = currentAvBudget()?.lane;
    if (lane && JOB_LANES.has(lane)) return 'job';
  } catch {
    return 'job';
  }
  return 'user';
}

type StoredCapMode = 'paced' | 'flat';

export type CapPlan = {
  cap: number;
  mode: StoredCapMode | 'shelf';
  usedAtStart: number | null;
  day: string;
  quota: number;
  targetPct: number;
  callsToday: number;
  refusedToday: number;
};

export type RoleCounts = Record<CgProcessRole, number>;

export type CgCapFields = {
  quota: number;
  targetPct: number;
  targetCredits: number;
  todayCap: number;
  callsToday: number;
  refusedToday: number;
  capMode: CapPlan['mode'];
  /** Redis ledger plus shelf admissions. Null when neither store answered. */
  globalReserved: number | null;
  fallbackByRole: RoleCounts;
  timeouts: number;
};

type FallbackCode = 'timeout' | 'error' | 'absent';
type ShelfCharge = 'admitted' | 'exhausted' | 'unavailable';

export type CgShelfPort = {
  chargeWeb(day: string, limit: number, timeoutInc: number): Promise<ShelfCharge>;
  noteTimeout(day: string, role: CgProcessRole): Promise<void>;
  read(day: string): Promise<{ spent: RoleCounts; timeouts: number } | null>;
};

type ParsedLedger = {
  ok: boolean;
  issued: number;
  refused: number;
  cap: number;
  mode: StoredCapMode;
  usedAtStart: number | null;
};

type LedgerOutcome =
  | { kind: 'ready'; parsed: ParsedLedger }
  | { kind: 'unconfirmed'; code: FallbackCode; attempted: boolean };

const memory = { day: '', allowed: 0, refused: 0 };
let lastBudgetLogAt = 0;
let lastHourlyLogAt = 0;
const fallbackCounts: Record<FallbackCode, number> = { timeout: 0, error: 0, absent: 0 };
let lastFallbackLogAt = 0;
let redisBackoffUntil = 0;
let shelfPort: CgShelfPort | null = null;

export function setCgShelfForTests(port: CgShelfPort | null): void {
  shelfPort = port;
}

export function resetCgCapStateForTests(): void {
  memory.day = '';
  memory.allowed = 0;
  memory.refused = 0;
  lastBudgetLogAt = 0;
  lastHourlyLogAt = 0;
  lastFallbackLogAt = 0;
  fallbackCounts.timeout = 0;
  fallbackCounts.error = 0;
  fallbackCounts.absent = 0;
  redisBackoffUntil = 0;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asCount(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function emptyRoles(): RoleCounts {
  return { web: 0, worker: 0, jarvis: 0 };
}

/** JS twin of CG_LEDGER_LUA. The test fake's eval delegates here. */
export function applyCgLedger(store: Map<string, unknown>, keys: string[], args: Array<string | number>): unknown[] {
  const [ledgerKey, snapshotKey, legacyKey, monthKey] = keys;
  const flatCap = Number(args[0]);
  const quota = Number(args[1]);
  const targetPct = Number(args[2]);
  const daysLeft = Number(args[3]);
  const nowMs = Number(args[4]);
  const freshMs = Number(args[5]);
  const charge = Number(args[7]) === 1 ? 1 : 0;

  const existing = asRecord(store.get(ledgerKey));
  let cap = finiteNumber(existing?.cap) ?? 0;
  let mode: StoredCapMode = existing?.mode === 'paced' ? 'paced' : 'flat';
  let used = finiteNumber(existing?.used);
  if (used !== null && used < 0) used = null;
  let snapshotAt = typeof existing?.snapshotAt === 'string' ? existing.snapshotAt : null;
  let issued = finiteNumber(existing?.issued) ?? 0;
  let refused = finiteNumber(existing?.refused) ?? 0;
  const legacy = finiteNumber(store.get(legacyKey));
  if (legacy !== null && legacy > issued) issued = legacy;

  const snap = asRecord(store.get(snapshotKey));
  let freshAt: string | null = null;
  let freshUsed: number | null = null;
  if (snap) {
    const atMs = finiteNumber(snap.atMs);
    if (atMs !== null && nowMs >= atMs && nowMs - atMs <= freshMs) {
      freshAt = typeof snap.at === 'string' ? snap.at : String(atMs);
      const key = asRecord(snap.key);
      freshUsed = finiteNumber(key?.current_total_monthly_calls);
    }
  }
  const monthUsed = finiteNumber(store.get(monthKey)) ?? 0;

  if (freshAt !== null && mode === 'paced' && snapshotAt === freshAt) {
    // Sealed against this snapshot.
  } else if (freshAt !== null) {
    if (used === null) used = freshUsed ?? monthUsed;
    cap = pacedDailyCap(quota, targetPct, used ?? 0, daysLeft);
    mode = 'paced';
    snapshotAt = freshAt;
  } else if (mode === 'paced' && existing && finiteNumber(existing.cap) !== null) {
    // Keep today's paced cap while /key is between refreshes.
  } else {
    cap = Number.isFinite(flatCap) && flatCap > 0 ? Math.floor(flatCap) : 0;
    mode = 'flat';
    used = null;
    snapshotAt = null;
  }

  const hardMax = Number(args[8]);
  if (Number.isFinite(hardMax) && hardMax > 0 && cap > hardMax) cap = Math.floor(hardMax);

  let ok = 1;
  if (charge === 1) {
    issued += 1;
    if (!(cap >= 0) || issued > cap) {
      issued -= 1;
      refused += 1;
      ok = 0;
    }
  }

  store.set(ledgerKey, { cap, mode, used: used === null ? -1 : used, snapshotAt, issued, refused });
  return ['cg', ok, issued, refused, cap, mode, used === null ? -1 : used];
}

function parseLedger(raw: unknown): ParsedLedger | null {
  if (!Array.isArray(raw) || raw.length < 7 || raw[0] !== 'cg') return null;
  const flag = Number(raw[1]);
  if (flag !== 0 && flag !== 1) return null;
  const mode = raw[5] === 'paced' || raw[5] === 'flat' ? raw[5] : null;
  if (!mode) return null;
  if (![raw[2], raw[3], raw[4], raw[6]].every((value) => Number.isFinite(Number(value)))) return null;
  const used = Number(raw[6]);
  return {
    ok: flag === 1,
    issued: asCount(raw[2]),
    refused: asCount(raw[3]),
    cap: asCount(raw[4]),
    mode,
    usedAtStart: used < 0 ? null : used,
  };
}

type RedisLike = {
  eval?: (script: string, keys: string[], args: Array<string | number>) => Promise<unknown>;
};

function limiterRedis(): RedisLike | null {
  try {
    const getter = redisModule.getLimiterRedis ?? redisModule.getRedis;
    if (typeof getter !== 'function') return null;
    return getter();
  } catch {
    return null;
  }
}

function ledgerKeys(day: string, month: string): string[] {
  return [
    `${CG_REDIS_PREFIX}:ledger:${day}`,
    `${CG_REDIS_PREFIX}:key`,
    `${CG_REDIS_PREFIX}:cap-count:${day}`,
    `${CG_REDIS_PREFIX}:month:${month}`,
  ];
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('CG cap Redis timeout')), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function evalLedger(now: number, env: Record<string, string | undefined>, charge: 0 | 1): Promise<LedgerOutcome> {
  const redis = limiterRedis();
  if (!redis || typeof redis.eval !== 'function') return { kind: 'unconfirmed', code: 'absent', attempted: false };
  if (now < redisBackoffUntil) return { kind: 'unconfirmed', code: 'timeout', attempted: false };
  const { daysInMonth, daysLeft, day, month } = utcMonthParts(now);
  const args = [
    flatDailyCap(cgQuota(env), cgTargetPct(env), daysInMonth),
    cgQuota(env),
    cgTargetPct(env),
    daysLeft,
    now,
    KEY_FRESH_MS,
    COUNTER_TTL_SECONDS,
    charge,
    cgDailyHardMax(env),
  ];
  try {
    const parsed = parseLedger(await withTimeout(redis.eval(CG_LEDGER_LUA, ledgerKeys(day, month), args), CG_LIMITER_REDIS_TIMEOUT_MS));
    if (!parsed) {
      redisBackoffUntil = now + REDIS_BACKOFF_MS;
      return { kind: 'unconfirmed', code: 'error', attempted: true };
    }
    redisBackoffUntil = 0;
    return { kind: 'ready', parsed };
  } catch (error) {
    redisBackoffUntil = now + REDIS_BACKOFF_MS;
    return { kind: 'unconfirmed', code: redisFailureCode(error), attempted: true };
  }
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

function formatHourlyLine(reserved: number | null, cap: number, spent: RoleCounts, timeouts: number, callers: string): string {
  const reservedText = reserved === null ? 'unknown' : String(reserved);
  return `[CoinGecko] daily reserved=${reservedText} cap=${cap} fallback web=${spent.web} worker=${spent.worker} jarvis=${spent.jarvis} timeouts=${timeouts} callers=${callers}`;
}

async function maybeHourlyLog(now: number, env: Record<string, string | undefined>, reserved: number | null, cap: number): Promise<void> {
  if (lastHourlyLogAt === 0) {
    lastHourlyLogAt = now;
    return;
  }
  if (now - lastHourlyLogAt < HOUR_MS) return;
  lastHourlyLogAt = now;
  const day = utcMonthParts(now).day;
  const shelf = await readShelf(day, env).catch(() => null);
  const spent = shelf?.spent ?? emptyRoles();
  const shelfSpent = spent.web + spent.worker + spent.jarvis;
  const total = reserved === null ? (shelf ? shelfSpent : null) : reserved + shelfSpent;
  const callers = await readCgCallerCounts(now).then(formatCgCallerCounts).catch(() => 'none');
  console.log(formatHourlyLine(total, cap, spent, shelf?.timeouts ?? 0, callers));
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

function rollMemory(day: string): void {
  if (memory.day !== day) {
    memory.day = day;
    memory.allowed = 0;
    memory.refused = 0;
  }
}

let productionShelf: CgShelfPort | null = null;

async function postgresShelf(): Promise<CgShelfPort> {
  if (productionShelf) return productionShelf;
  const { pool } = await import('@/lib/db');
  productionShelf = {
    async chargeWeb(day, limit, timeoutInc) {
      if (!(limit > 0)) return 'exhausted';
      if (!process.env.DATABASE_URL) return 'unavailable';
      try {
        const result = await withTimeout(
          pool.query(
            `INSERT INTO cg_call_shelf AS s (day, role, spent, timeouts)
             VALUES ($1::date, 'web', 1, $2::int)
             ON CONFLICT (day, role) DO UPDATE
             SET spent = s.spent + 1,
                 timeouts = s.timeouts + EXCLUDED.timeouts
             WHERE s.spent < $3::int
             RETURNING spent`,
            [day, timeoutInc, limit],
          ),
          CG_SHELF_WAIT_MS,
        );
        return result.rows.length > 0 ? 'admitted' : 'exhausted';
      } catch {
        return 'unavailable';
      }
    },
    async noteTimeout(day, role) {
      if (!process.env.DATABASE_URL) return;
      await withTimeout(
        pool.query(
          `INSERT INTO cg_call_shelf (day, role, spent, timeouts)
           VALUES ($1::date, $2, 0, 1)
           ON CONFLICT (day, role) DO UPDATE
           SET timeouts = cg_call_shelf.timeouts + 1`,
          [day, role],
        ),
        CG_SHELF_WAIT_MS,
      );
    },
    async read(day) {
      if (!process.env.DATABASE_URL) return null;
      const result = await withTimeout(
        pool.query(`SELECT role, spent, timeouts FROM cg_call_shelf WHERE day = $1::date`, [day]),
        CG_SHELF_WAIT_MS,
      );
      const spent = emptyRoles();
      let timeouts = 0;
      for (const row of result.rows as { role: string; spent: number; timeouts: number }[]) {
        if (row.role === 'web' || row.role === 'worker' || row.role === 'jarvis') spent[row.role] = asCount(row.spent);
        timeouts += asCount(row.timeouts);
      }
      return { spent, timeouts };
    },
  };
  return productionShelf;
}

async function activeShelf(): Promise<CgShelfPort | null> {
  if (shelfPort) return shelfPort;
  // Provider contract tests call cgFetch with no Redis and no DATABASE_URL.
  // Production never sets VITEST, so a missing shelf there fails closed.
  if (process.env.VITEST === 'true') return null;
  if (!process.env.DATABASE_URL) return null;
  try {
    return await postgresShelf();
  } catch {
    return null;
  }
}

async function chargeUserShelf(day: string, limit: number, timeoutInc: number): Promise<ShelfCharge> {
  const shelf = await activeShelf();
  if (!shelf) {
    if (process.env.VITEST !== 'true') return 'unavailable';
    if (!(limit > 0)) return 'exhausted';
    rollMemory(day);
    if (memory.allowed >= limit) {
      memory.refused += 1;
      return 'exhausted';
    }
    memory.allowed += 1;
    return 'admitted';
  }
  try {
    return await shelf.chargeWeb(day, limit, timeoutInc);
  } catch {
    return 'unavailable';
  }
}

async function noteShelfTimeout(day: string, role: CgProcessRole): Promise<void> {
  const shelf = await activeShelf();
  if (!shelf) return;
  await shelf.noteTimeout(day, role).catch(() => undefined);
}

async function readShelf(day: string, _env: Record<string, string | undefined>): Promise<{ spent: RoleCounts; timeouts: number } | null> {
  const shelf = await activeShelf();
  if (!shelf) return null;
  try {
    return await shelf.read(day);
  } catch {
    return null;
  }
}

/** Reads the sealed ledger. Does not call CoinGecko. Charge 0 does not increment. */
export async function planDailyCap(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<CapPlan> {
  const quota = cgQuota(env);
  const targetPct = cgTargetPct(env);
  const { daysInMonth, day } = utcMonthParts(now);
  const flat = clampDailyCap(flatDailyCap(quota, targetPct, daysInMonth), cgDailyHardMax(env));
  const outcome = await evalLedger(now, env, 0);
  if (outcome.kind === 'unconfirmed') {
    return {
      cap: flat,
      mode: outcome.code === 'absent' && !limiterRedis() ? 'shelf' : 'flat',
      usedAtStart: null,
      day,
      quota,
      targetPct,
      callsToday: 0,
      refusedToday: 0,
    };
  }
  return {
    cap: outcome.parsed.cap,
    mode: outcome.parsed.mode,
    usedAtStart: outcome.parsed.usedAtStart,
    day,
    quota,
    targetPct,
    callsToday: outcome.parsed.issued,
    refusedToday: outcome.parsed.refused,
  };
}

export async function capFields(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<CgCapFields> {
  const plan = await planDailyCap(now, env);
  const shelf = await readShelf(plan.day, env);
  const fallbackByRole = shelf?.spent ?? emptyRoles();
  const timeouts = shelf?.timeouts ?? 0;
  const shelfSpent = fallbackByRole.web + fallbackByRole.worker + fallbackByRole.jarvis;
  const ledgerKnown = plan.mode !== 'shelf';
  const globalReserved = ledgerKnown ? plan.callsToday + shelfSpent : shelf ? shelfSpent : null;
  const fields: CgCapFields = {
    quota: plan.quota,
    targetPct: plan.targetPct,
    targetCredits: Math.floor(plan.quota * (plan.targetPct / 100)),
    todayCap: plan.cap,
    callsToday: globalReserved ?? 0,
    refusedToday: plan.refusedToday,
    capMode: plan.mode,
    globalReserved,
    fallbackByRole,
    timeouts,
  };
  await maybeHourlyLog(now, env, plan.mode === 'shelf' ? null : plan.callsToday, plan.cap);
  return fields;
}

/**
 * Reserve one CoinGecko HTTP attempt. Throws CG_MONTHLY_CAP when today's cap is
 * spent or the global reserve cannot be confirmed for a job. A user-facing miss
 * spends the shared shelf or throws so cgFetch can serve cache.
 */
export async function reserveCgCall(now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<void> {
  const { daysInMonth, day } = utcMonthParts(now);
  const flat = clampDailyCap(flatDailyCap(cgQuota(env), cgTargetPct(env), daysInMonth), cgDailyHardMax(env));
  const share = conservativeProcessShare(flat, cgEstimatedProcesses(env));
  const outcome = await evalLedger(now, env, 1);

  if (outcome.kind === 'ready') {
    noteBudgetLine(outcome.parsed.issued, outcome.parsed.cap, outcome.parsed.refused, now);
    await maybeHourlyLog(now, env, outcome.parsed.issued, outcome.parsed.cap);
    if (!outcome.parsed.ok) throw new CgMonthlyCapError();
    return;
  }

  noteFallback(outcome.code, now, share);
  const duty = cgDuty(env);
  if (duty === 'job') {
    if (outcome.attempted && outcome.code === 'timeout') await noteShelfTimeout(day, cgProcessRole(env));
    await maybeHourlyLog(now, env, null, flat);
    throw new CgMonthlyCapError();
  }

  const admitted = await chargeUserShelf(day, share, outcome.attempted && outcome.code === 'timeout' ? 1 : 0);
  await maybeHourlyLog(now, env, null, flat);
  if (admitted === 'admitted') return;
  throw new CgMonthlyCapError();
}
