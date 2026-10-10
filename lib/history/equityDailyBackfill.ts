/**
 * One-shot 20-year raw daily equity load into ohlcv_bars.
 * The script owns the run. This module does not create tables and does not call Alpha Vantage
 * unless a caller invokes the run with the kill switch on.
 */
import { avRowVolume } from '@/lib/scanner/avVolume';
import {
  isUsTradingDay,
  lastCompletedUsSessionDate,
  nyDateTime,
  previousUsTradingDay,
  toYmd,
} from '@/lib/time/usSession';

export const CAMPAIGN = 'av-daily-raw-20y-v1';
export const KILL_SWITCH = 'EQUITY_DAILY_BACKFILL';
export const FEATURE = 'equity-daily-history';

export const UNIVERSE_SQL = `SELECT symbol FROM symbol_universe
 WHERE enabled = TRUE AND COALESCE(asset_type, 'equity') = 'equity'
 ORDER BY tier ASC, symbol ASC`;

export const PROGRESS_SQL = `SELECT symbol, status, attempts, provider_oldest, written_from
  FROM equity_history_backfill WHERE campaign = $1`;

export const STORED_BARS_SQL = `SELECT ts, open, high, low, close, volume
  FROM ohlcv_bars
 WHERE symbol = $1 AND timeframe = 'daily' AND ts >= $2::timestamptz AND ts <= $3::timestamptz
 ORDER BY ts ASC`;

export const STALE_DONE_SQL = `SELECT 1 FROM ohlcv_bars
 WHERE symbol = $1 AND timeframe = 'daily'
   AND ts >= $2::timestamptz
   AND ts < $2::timestamptz + INTERVAL '14 days'
 LIMIT 1`;

export const UPSERT_BARS_SQL = `INSERT INTO ohlcv_bars (symbol, timeframe, ts, open, high, low, close, volume)
SELECT $1, 'daily', r.ts, r.open, r.high, r.low, r.close, r.volume
  FROM unnest($2::timestamptz[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::bigint[])
       AS r(ts, open, high, low, close, volume)
 WHERE EXISTS (
   SELECT 1 FROM symbol_universe u
    WHERE u.symbol = $1 AND u.enabled AND COALESCE(u.asset_type, 'equity') = 'equity')
 ORDER BY r.ts
ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
  open   = EXCLUDED.open,
  high   = EXCLUDED.high,
  low    = EXCLUDED.low,
  close  = EXCLUDED.close,
  volume = CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE ohlcv_bars.volume END
WHERE (ohlcv_bars.open, ohlcv_bars.high, ohlcv_bars.low, ohlcv_bars.close, ohlcv_bars.volume)
      IS DISTINCT FROM
      (EXCLUDED.open, EXCLUDED.high, EXCLUDED.low, EXCLUDED.close,
       CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE ohlcv_bars.volume END)`;

export const PROGRESS_UPSERT_SQL = `INSERT INTO equity_history_backfill (
  campaign, symbol, status, attempts, provider_oldest, written_from, written_through,
  inserted_rows, volume_repaired, provider_zero_volume, last_error, updated_at)
VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::date, $8, $9, $10, $11, now())
ON CONFLICT (campaign, symbol) DO UPDATE SET
  status = EXCLUDED.status,
  attempts = EXCLUDED.attempts,
  provider_oldest = EXCLUDED.provider_oldest,
  written_from = EXCLUDED.written_from,
  written_through = EXCLUDED.written_through,
  inserted_rows = EXCLUDED.inserted_rows,
  volume_repaired = EXCLUDED.volume_repaired,
  provider_zero_volume = EXCLUDED.provider_zero_volume,
  last_error = EXCLUDED.last_error,
  updated_at = now()`;

export const AUDIT_DEPTH_SQL = `SELECT b.symbol,
       COUNT(*)::int AS bars,
       MIN(b.ts) AS first,
       MAX(b.ts) AS last,
       COUNT(*) FILTER (WHERE b.volume = 0)::int AS zero_volume
  FROM ohlcv_bars b
  JOIN symbol_universe u ON u.symbol = b.symbol
 WHERE b.timeframe = 'daily'
   AND u.enabled AND COALESCE(u.asset_type, 'equity') = 'equity'
 GROUP BY b.symbol
 ORDER BY b.symbol`;

export const AUDIT_SIZE_SQL = `SELECT pg_database_size(current_database())::bigint AS db_bytes,
       pg_total_relation_size('ohlcv_bars')::bigint AS bars_bytes`;

export const AUDIT_OFF_MIDNIGHT_SQL = `SELECT COUNT(*)::int AS off_midnight
  FROM ohlcv_bars b
  JOIN symbol_universe u ON u.symbol = b.symbol
 WHERE b.timeframe = 'daily'
   AND u.enabled AND COALESCE(u.asset_type, 'equity') = 'equity'
   AND b.ts <> (to_char(b.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' 00:00:00+00')::timestamptz`;

export const AUDIT_OTHER_TYPES_SQL = `SELECT COALESCE(asset_type, 'equity') AS asset_type, COUNT(*)::int AS n
  FROM symbol_universe
 WHERE enabled
   AND COALESCE(asset_type, 'equity') <> 'equity'
   AND COALESCE(asset_type, 'equity') NOT IN ('crypto', 'forex')
 GROUP BY 1
 ORDER BY 1`;

const CHUNK = 1000;
const DENIAL_BUDGET_MS = 10 * 60_000;
const DENIAL_SLEEP_MS = 30_000;
const MAX_ATTEMPTS = 3;

export type ExitCode = 0 | 1 | 2 | 3 | 4;
export type ProgressStatus = 'done' | 'no_data' | 'retry' | 'failed';

export interface RawDailyBar {
  session: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WriteWindow {
  from: string;
  through: string;
}

export interface SymbolWritePlan {
  rows: RawDailyBar[];
  insert: number;
  volumeRepair: number;
  priceRewrite: number;
  unchanged: number;
}

export interface StoredDailyBar {
  ts: unknown;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
}

export type FetchOutcome =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'throttle'; reason: string }
  | { kind: 'no_data'; reason: string }
  | { kind: 'transient'; reason: string };

export interface BackfillReport {
  exitCode: ExitCode;
  status: 'disabled' | 'refused' | 'complete' | 'resumable' | 'throttle' | 'crash';
  avCalls: number;
  done: number;
  skipped: number;
  failed: number;
  noData: number;
  reason?: string;
}

export interface AuditReport {
  exitCode: 0 | 1;
  avCalls: 0;
  error?: string;
  equitySymbols?: number;
  symbolsWithBars?: number;
  zeroVolumeRows?: number;
  offMidnight?: number;
  dbBytes?: number;
  barsBytes?: number;
  otherEnabledTypes?: { assetType: string; n: number }[];
}

interface ProgressRow {
  symbol: string;
  status: string;
  attempts: number;
  provider_oldest: unknown;
  written_from: unknown;
}

export interface QueryClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

export interface BackfillDeps {
  nowMs: () => number;
  role: () => string;
  limiterRedisPresent: () => boolean;
  paceMs: () => number;
  takeToken: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  tx: (work: (client: QueryClient) => Promise<void>) => Promise<void>;
  fetchDaily: (symbol: string) => Promise<FetchOutcome>;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

export function backfillEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[KILL_SWITCH] === '1';
}

export function backfillPaceMs(reservePerMin: number): number {
  if (!Number.isFinite(reservePerMin) || reservePerMin <= 0) return 60_000;
  return Math.ceil(60_000 / reservePerMin);
}

/** Open outside 08:30–20:30 America/New_York on a US trading day, and all day otherwise. */
export function backfillWindowOpen(nowMs: number): boolean {
  const { ymd, minutes } = nyDateTime(nowMs);
  if (!isUsTradingDay(ymd)) return true;
  return minutes < 8 * 60 + 30 || minutes >= 20 * 60 + 30;
}

export function writeWindow(nowMs: number): WriteWindow {
  const completed = lastCompletedUsSessionDate(nowMs);
  const through = previousUsTradingDay(completed);
  return { from: shiftYears(through, -20), through };
}

export function sessionTs(session: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session)) throw new Error(`bad session date ${session}`);
  return `${session}T00:00:00.000Z`;
}

export function classifyAvPayload(json: unknown): FetchOutcome {
  if (!json || typeof json !== 'object') return { kind: 'transient', reason: 'empty payload' };
  const body = json as Record<string, unknown>;
  const note = body.Note ?? body.Information;
  if (typeof note === 'string' && note.length > 0) return { kind: 'throttle', reason: note.slice(0, 240) };
  const error = body['Error Message'];
  if (typeof error === 'string' && error.length > 0) return { kind: 'no_data', reason: error.slice(0, 240) };
  const series = body['Time Series (Daily)'];
  if (!series || typeof series !== 'object') return { kind: 'no_data', reason: 'no daily series' };
  return { kind: 'ok', payload: json };
}

export function parseDailyAdjustedRaw(payload: unknown, window: WriteWindow): {
  bars: RawDailyBar[];
  providerOldest: string | null;
  providerZeroVolume: number;
  rejected: number;
} {
  const classified = classifyAvPayload(payload);
  if (classified.kind !== 'ok') return { bars: [], providerOldest: null, providerZeroVolume: 0, rejected: 0 };
  const series = (payload as Record<string, unknown>)['Time Series (Daily)'] as Record<string, Record<string, string>>;
  const dates = Object.keys(series).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  let providerOldest: string | null = null;
  let rejected = 0;
  let providerZeroVolume = 0;
  const bars: RawDailyBar[] = [];
  for (const session of dates) {
    const row = series[session] ?? {};
    const open = num(row['1. open']);
    const high = num(row['2. high']);
    const low = num(row['3. low']);
    const close = num(row['4. close']);
    if (open == null || high == null || low == null || close == null || !saneOhlc(open, high, low, close)) {
      rejected += 1;
      continue;
    }
    if (providerOldest == null || session < providerOldest) providerOldest = session;
    if (session < window.from || session > window.through) continue;
    const volume = avRowVolume(row);
    if (volume === 0) providerZeroVolume += 1;
    bars.push({ session, ts: sessionTs(session), open, high, low, close, volume });
  }
  return { bars, providerOldest, providerZeroVolume, rejected };
}

export function planSymbolWrite(incoming: readonly RawDailyBar[], stored: readonly StoredDailyBar[]): SymbolWritePlan {
  const have = new Map<string, { open: number; high: number; low: number; close: number; volume: number }>();
  for (const row of stored) {
    const session = toYmd(row.ts);
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const close = num(row.close);
    const volume = num(row.volume);
    if (!session || open == null || high == null || low == null || close == null || volume == null) continue;
    have.set(session, { open, high, low, close, volume: Math.round(volume) });
  }
  const rows: RawDailyBar[] = [];
  let insert = 0;
  let volumeRepair = 0;
  let priceRewrite = 0;
  let unchanged = 0;
  for (const bar of incoming) {
    const prev = have.get(bar.session);
    if (!prev) {
      insert += 1;
      rows.push(bar);
      continue;
    }
    const volume = bar.volume > 0 ? bar.volume : prev.volume;
    const priceChanged = !samePx(prev.open, bar.open) || !samePx(prev.high, bar.high) || !samePx(prev.low, bar.low) || !samePx(prev.close, bar.close);
    const repairsVolume = prev.volume === 0 && bar.volume > 0;
    if (!priceChanged && volume === prev.volume) {
      unchanged += 1;
      continue;
    }
    if (repairsVolume) volumeRepair += 1;
    if (priceChanged) priceRewrite += 1;
    rows.push({ ...bar, volume });
  }
  return { rows, insert, volumeRepair, priceRewrite, unchanged };
}

export async function auditEquityHistory(deps: Pick<BackfillDeps, 'query' | 'log'>): Promise<AuditReport> {
  try {
    const depth = await deps.query(AUDIT_DEPTH_SQL);
    const [size] = await deps.query(AUDIT_SIZE_SQL);
    const [midnight] = await deps.query(AUDIT_OFF_MIDNIGHT_SQL);
    const others = await deps.query(AUDIT_OTHER_TYPES_SQL);
    const [universe] = await deps.query(
      `SELECT COUNT(*)::int AS n FROM symbol_universe WHERE enabled = TRUE AND COALESCE(asset_type, 'equity') = 'equity'`,
    );
    let zeroVolumeRows = 0;
    for (const row of depth) zeroVolumeRows += Number((row as { zero_volume?: unknown }).zero_volume ?? 0);
    const sizeRow = (size ?? {}) as { db_bytes?: unknown; bars_bytes?: unknown };
    const report: AuditReport = {
      exitCode: 0,
      avCalls: 0,
      equitySymbols: Number((universe as { n?: unknown } | undefined)?.n ?? 0),
      symbolsWithBars: depth.length,
      zeroVolumeRows,
      offMidnight: Number((midnight as { off_midnight?: unknown } | undefined)?.off_midnight ?? 0),
      dbBytes: Number(sizeRow.db_bytes ?? 0),
      barsBytes: Number(sizeRow.bars_bytes ?? 0),
      otherEnabledTypes: others.map((row) => {
        const typed = row as { asset_type?: unknown; n?: unknown };
        return { assetType: String(typed.asset_type ?? ''), n: Number(typed.n ?? 0) };
      }),
    };
    deps.log(`audit equities=${report.equitySymbols} withBars=${report.symbolsWithBars} zeroVolumeRows=${report.zeroVolumeRows} dbBytes=${report.dbBytes}`);
    return report;
  } catch (err) {
    return { exitCode: 1, avCalls: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runEquityHistoryBackfill(input: {
  env: NodeJS.ProcessEnv;
  symbols?: string[];
  deps: BackfillDeps;
}): Promise<BackfillReport> {
  if (!backfillEnabled(input.env)) {
    return { exitCode: 0, status: 'disabled', avCalls: 0, done: 0, skipped: 0, failed: 0, noData: 0 };
  }
  const deps = input.deps;
  if (deps.role() !== 'jarvis') {
    return refuse('role');
  }
  if (!deps.limiterRedisPresent()) {
    return refuse('limiter redis absent');
  }
  const now = deps.nowMs();
  if (!backfillWindowOpen(now)) {
    return { exitCode: 3, status: 'resumable', avCalls: 0, done: 0, skipped: 0, failed: 0, noData: 0, reason: 'window closed' };
  }
  const window = writeWindow(now);
  let universe: string[];
  let progress: Map<string, ProgressRow>;
  try {
    universe = (await deps.query(UNIVERSE_SQL)).map((row) => String((row as { symbol: string }).symbol).toUpperCase());
    progress = new Map((await deps.query(PROGRESS_SQL, [CAMPAIGN])).map((row) => {
      const typed = row as ProgressRow;
      return [String(typed.symbol).toUpperCase(), { ...typed, symbol: String(typed.symbol).toUpperCase(), attempts: Number(typed.attempts) }] as const;
    }));
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }
  const requested = (input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
  let symbols = universe;
  if (requested.length > 0) {
    const known = new Set(universe);
    const missing = requested.filter((s) => !known.has(s));
    if (missing.length > 0) return refuse(`not in the enabled equity universe: ${missing.join(',')}`);
    symbols = requested;
  }
  const counts = { done: 0, skipped: 0, failed: 0, noData: 0, avCalls: 0 };
  let lastStart = 0;
  for (const symbol of symbols) {
    if (!backfillWindowOpen(deps.nowMs())) {
      return { exitCode: 3, status: 'resumable', ...counts, reason: 'window closed' };
    }
    if (!deps.limiterRedisPresent()) return stopped(counts, 2, 'refused', 'limiter redis absent');
    const prior = progress.get(symbol);
    const force = requested.length > 0;
    if (!force && prior && (prior.status === 'done' || prior.status === 'no_data' || prior.status === 'failed')) {
      if (prior.status === 'done') {
        const anchor = storedTailAnchor(prior);
        if (anchor) {
          const hit = await deps.query(STALE_DONE_SQL, [symbol, sessionTs(anchor)]);
          if (hit.length === 0) {
            deps.log(`${symbol} done row has no stored bars; reopening`);
          } else {
            counts.skipped += 1;
            continue;
          }
        } else {
          counts.skipped += 1;
          continue;
        }
      } else {
        counts.skipped += 1;
        continue;
      }
    }
    const pace = deps.paceMs();
    const wait = lastStart === 0 ? 0 : pace - (deps.nowMs() - lastStart);
    if (wait > 0) await deps.sleep(wait);
    const taken = await takeOrStop(deps, counts);
    if (taken.stop) return taken.stop;
    lastStart = deps.nowMs();
    counts.avCalls += 1;
    let outcome: FetchOutcome;
    try {
      outcome = await deps.fetchDaily(symbol);
    } catch (err) {
      outcome = { kind: 'transient', reason: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.kind === 'throttle') {
      deps.log(`${symbol} throttle: ${outcome.reason}`);
      return { exitCode: 4, status: 'throttle', ...counts, reason: outcome.reason };
    }
    const attempts = Number(prior?.attempts ?? 0) + 1;
    if (outcome.kind === 'no_data') {
      await deps.query(PROGRESS_UPSERT_SQL, [CAMPAIGN, symbol, 'no_data', attempts, null, null, null, 0, 0, 0, outcome.reason]);
      remember(progress, symbol, 'no_data', attempts);
      counts.noData += 1;
      continue;
    }
    if (outcome.kind === 'transient') {
      const status: ProgressStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
      await deps.query(PROGRESS_UPSERT_SQL, [CAMPAIGN, symbol, status, attempts, null, null, null, 0, 0, 0, outcome.reason]);
      remember(progress, symbol, status, attempts);
      if (status === 'failed') counts.failed += 1;
      deps.log(`${symbol} ${status}: ${outcome.reason}`);
      continue;
    }
    const parsed = parseDailyAdjustedRaw(outcome.payload, window);
    const stored = await deps.query(STORED_BARS_SQL, [symbol, sessionTs(window.from), sessionTs(window.through)]);
    const plan = planSymbolWrite(parsed.bars, stored as StoredDailyBar[]);
    try {
      await deps.tx(async (client) => {
        for (let i = 0; i < plan.rows.length; i += CHUNK) {
          const chunk = plan.rows.slice(i, i + CHUNK);
          await client.query(UPSERT_BARS_SQL, [
            symbol,
            chunk.map((b) => b.ts),
            chunk.map((b) => b.open),
            chunk.map((b) => b.high),
            chunk.map((b) => b.low),
            chunk.map((b) => b.close),
            chunk.map((b) => b.volume),
          ]);
        }
        await client.query(PROGRESS_UPSERT_SQL, [
          CAMPAIGN, symbol, 'done', attempts, parsed.providerOldest, window.from, window.through,
          plan.insert, plan.volumeRepair, parsed.providerZeroVolume, null,
        ]);
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const status: ProgressStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
      try {
        await deps.query(PROGRESS_UPSERT_SQL, [CAMPAIGN, symbol, status, attempts, null, null, null, 0, 0, 0, reason]);
      } catch (writeErr) {
        return {
          exitCode: 1, status: 'crash', ...counts,
          reason: writeErr instanceof Error ? writeErr.message : String(writeErr),
        };
      }
      remember(progress, symbol, status, attempts);
      if (status === 'failed') counts.failed += 1;
      deps.log(`${symbol} ${status}: ${reason}`);
      continue;
    }
    remember(progress, symbol, 'done', attempts, { provider_oldest: parsed.providerOldest, written_from: window.from });
    counts.done += 1;
    deps.log(`${symbol} done insert=${plan.insert} volumeRepair=${plan.volumeRepair} unchanged=${plan.unchanged}`);
  }
  if (counts.failed > 0) {
    return { exitCode: 1, status: 'crash', ...counts, reason: 'symbol failed' };
  }
  const pendingRetry = symbols.some((symbol) => progress.get(symbol)?.status === 'retry');
  if (pendingRetry) {
    return { exitCode: 3, status: 'resumable', ...counts, reason: 'retry remaining' };
  }
  return { exitCode: 0, status: 'complete', ...counts };
}

export function parseSymbolsArg(argv: readonly string[]): string[] | undefined {
  const raw = argv.find((arg) => arg.startsWith('--symbols='));
  if (!raw) return undefined;
  return raw.slice('--symbols='.length).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

export async function runCli(argv: readonly string[], env: NodeJS.ProcessEnv, deps: BackfillDeps): Promise<BackfillReport | AuditReport> {
  if (argv.includes('--audit')) return auditEquityHistory(deps);
  return runEquityHistoryBackfill({ env, symbols: parseSymbolsArg(argv), deps });
}

function refuse(reason: string): BackfillReport {
  return { exitCode: 2, status: 'refused', avCalls: 0, done: 0, skipped: 0, failed: 0, noData: 0, reason };
}

function stopped(
  counts: { avCalls: number; done: number; skipped: number; failed: number; noData: number },
  exitCode: ExitCode,
  status: BackfillReport['status'],
  reason: string,
): BackfillReport {
  return { exitCode, status, ...counts, reason };
}

function remember(
  progress: Map<string, ProgressRow>,
  symbol: string,
  status: ProgressStatus,
  attempts: number,
  fields?: Partial<ProgressRow>,
): void {
  const prev = progress.get(symbol);
  progress.set(symbol, {
    symbol,
    status,
    attempts,
    provider_oldest: fields?.provider_oldest ?? prev?.provider_oldest ?? null,
    written_from: fields?.written_from ?? prev?.written_from ?? null,
  });
}

/** First session we expected to store. A later provider start beats the 20-year window, so a young listing is not reopened. */
function storedTailAnchor(row: ProgressRow): string | null {
  const from = toYmd(row.written_from);
  const oldest = toYmd(row.provider_oldest);
  if (from && oldest) return oldest > from ? oldest : from;
  return from ?? oldest;
}

async function takeOrStop(
  deps: BackfillDeps,
  counts: { avCalls: number; done: number; skipped: number; failed: number; noData: number },
): Promise<{ stop?: BackfillReport }> {
  const started = deps.nowMs();
  for (;;) {
    if (!deps.limiterRedisPresent()) {
      return { stop: { exitCode: 2, status: 'refused', ...counts, reason: 'limiter redis absent' } };
    }
    try {
      await deps.takeToken();
      return {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/redis unavailable/i.test(message)) {
        return { stop: { exitCode: 2, status: 'refused', ...counts, reason: message } };
      }
      if (!/denied/i.test(message)) {
        return { stop: { exitCode: 1, status: 'crash', ...counts, reason: message } };
      }
      if (deps.nowMs() - started >= DENIAL_BUDGET_MS) {
        return { stop: { exitCode: 3, status: 'resumable', ...counts, reason: 'limiter denied' } };
      }
      await deps.sleep(DENIAL_SLEEP_MS);
    }
  }
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function saneOhlc(open: number, high: number, low: number, close: number): boolean {
  return open > 0 && high > 0 && low > 0 && close > 0 && low <= Math.min(open, close) && high >= Math.max(open, close);
}

function samePx(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6;
}

function shiftYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}
