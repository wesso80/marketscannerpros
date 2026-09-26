/**
 * Worker equities on Alpha Vantage: bulk quotes + bar-close-aligned history refresh. Pure: no I/O.
 *
 * - One REALTIME_BULK_QUOTES call per 100 symbols replaces a GLOBAL_QUOTE call per symbol.
 * - Today's daily bar is built from the bulk quote (open / high / low / price / volume) and merged into the held
 *   TIME_SERIES_DAILY_ADJUSTED history, so indicators and TGM keep seeing a live last bar.
 * - TIME_SERIES_DAILY_ADJUSTED is refetched only after the session close (+ settle) and once pre-open (split /
 *   dividend adjustments). TIME_SERIES_INTRADAY 60min is refetched only after each hourly close (+ settle).
 */
import {
  isUsTradingDay,
  lastCompletedUsSessionDate,
  nyDateTime,
  previousUsTradingDay,
  usSessionCloseMinutes,
} from '@/lib/time/usSession';
import { nyWallTimeToUtcMs } from '@/lib/time/nyWallClock';

/** Worker share of the 600 rpm AV plan (the web avRateGovernor takes the rest). Never exceeded, whatever the env says. */
export const WORKER_AV_MAX_RPM = 200;
/** REALTIME_BULK_QUOTES accepts at most 100 symbols per call. */
export const AV_BULK_QUOTE_BATCH = 100;
/** TIME_SERIES_DAILY_ADJUSTED outputsize=compact returns 100 bars; the merged history keeps the same length. */
export const AV_DAILY_COMPACT_BARS = 100;

/** Worker AV rpm from ALPHA_VANTAGE_RPM: default 200, clamped to 1..200. */
export function workerAvRpm(raw: string | undefined | null): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return WORKER_AV_MAX_RPM;
  return Math.min(WORKER_AV_MAX_RPM, n);
}

export function chunkSymbols(symbols: string[], size = AV_BULK_QUOTE_BATCH): string[][] {
  const unique = Array.from(new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)));
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/** AV error / throttle text in a payload, or null. */
export function avPayloadError(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object') return 'empty payload';
  const msg = p['Error Message'] ?? p['Note'] ?? p['Information'];
  return msg != null ? String(msg) : null;
}

/** Same shape the worker has always written to quotes_latest and the Redis quote cache (from GLOBAL_QUOTE). */
export interface WorkerEquityQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  changeAmt: number;
  changePct: number;
  latestDay: string;
}

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const n = Number(String(value).replace(/,/g, '').replace('%', '').trim());
  return Number.isFinite(n) ? n : Number.NaN;
};
const first = (...values: unknown[]): number => {
  for (const v of values) {
    const n = num(v);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
};
const orZero = (n: number): number => (Number.isFinite(n) ? n : 0);

/** The US session a quote belongs to: the quote's NY date, never later than the latest session whose open has passed. */
function quoteSessionDay(timestamp: unknown, nowMs: number): string {
  const { ymd, minutes } = nyDateTime(nowMs);
  const latestSession = isUsTradingDay(ymd) && minutes >= 9 * 60 + 30 ? ymd : previousUsTradingDay(ymd);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim());
  if (!m) return latestSession;
  return m[1] < latestSession ? m[1] : latestSession;
}

/**
 * REALTIME_BULK_QUOTES payload → worker quotes by symbol. Reads the documented lower-case rows (`symbol`, `open`, `high`,
 * `low`, `close`, `volume`, `previous_close`, `change`, `change_percent`, `timestamp` in NY wall time) and
 * GLOBAL_QUOTE-style numbered keys. Rows without a positive price are dropped. The bulk feed has no "latest trading
 * day", so it is the quote's NY date capped at the latest opened session (pre-market quotes stay on the prior session,
 * as GLOBAL_QUOTE reported them).
 */
export function parseWorkerBulkQuotes(payload: unknown, nowMs: number): Map<string, WorkerEquityQuote> {
  const out = new Map<string, WorkerEquityQuote>();
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return out;
  for (const row of rows as Array<Record<string, unknown>>) {
    const symbol = String(row?.symbol ?? row?.['01. symbol'] ?? '').trim().toUpperCase();
    if (!symbol) continue;
    const price = first(row?.close, row?.['05. price'], row?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const prevClose = first(row?.previous_close, row?.['08. previous close']);
    const reportedChange = first(row?.change, row?.['09. change']);
    const reportedPct = first(row?.change_percent, row?.['10. change percent']);
    const changeAmt = Number.isFinite(reportedChange) ? reportedChange : prevClose > 0 ? price - prevClose : 0;
    const changePct = Number.isFinite(reportedPct) ? reportedPct : prevClose > 0 ? (price / prevClose - 1) * 100 : 0;
    const volume = first(row?.volume, row?.['06. volume']);
    out.set(symbol, {
      price,
      open: orZero(first(row?.open, row?.['02. open'])),
      high: orZero(first(row?.high, row?.['03. high'])),
      low: orZero(first(row?.low, row?.['04. low'])),
      prevClose: orZero(prevClose),
      volume: Number.isFinite(volume) ? Math.round(volume) : 0,
      changeAmt,
      changePct,
      latestDay: quoteSessionDay(row?.timestamp ?? row?.['07. latest trading day'], nowMs),
    });
  }
  return out;
}

/** Daily bar as the worker holds it (AV DAILY_ADJUSTED rows: raw OHLC, timestamp YYYY-MM-DD). */
export interface DailyBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Today's in-progress daily bar from a bulk quote, or null when the quote is not for `sessionYmd` or lacks a sane
 * open / high / low. High and low are widened to cover open and price.
 */
export function buildLiveDailyBar(quote: WorkerEquityQuote | null | undefined, sessionYmd: string): DailyBar | null {
  if (!quote || quote.latestDay !== sessionYmd) return null;
  const { open, price } = quote;
  if (!(price > 0) || !(open > 0) || !(quote.high > 0) || !(quote.low > 0)) return null;
  return {
    timestamp: sessionYmd,
    open,
    high: Math.max(quote.high, open, price),
    low: Math.min(quote.low, open, price),
    close: price,
    volume: Math.max(0, Math.round(quote.volume || 0)),
  };
}

const barDay = (b: { timestamp: string }) => String(b.timestamp).slice(0, 10);

/**
 * Held daily history + live bar → the series indicators run on. The live bar replaces a bar with the same date or is
 * appended when newer; an older live bar is ignored. Keeps at most `maxBars` (the compact length) so indicator inputs
 * match what a fresh DAILY_ADJUSTED compact call returned.
 */
export function mergeLiveDailyBar(bars: DailyBar[], live: DailyBar | null, maxBars = AV_DAILY_COMPACT_BARS): DailyBar[] {
  const sorted = [...bars].sort((a, b) => barDay(a).localeCompare(barDay(b)));
  if (live) {
    const day = barDay(live);
    const last = sorted[sorted.length - 1];
    if (!last || barDay(last) < day) sorted.push(live);
    else if (barDay(last) === day) sorted[sorted.length - 1] = live;
  }
  return sorted.length > maxBars ? sorted.slice(sorted.length - maxBars) : sorted;
}

export interface EquityBarSchedule {
  /** Minutes after the session close before the daily history is refetched (AV finalises the bar). */
  dailySettleMin: number;
  /** NY minutes of the pre-open daily refresh (split / dividend adjusted history for the new session). */
  preOpenMin: number;
  /** Minutes after an hourly close before the 60min series is refetched. */
  hourlySettleMin: number;
  /** Retry an incomplete or failed fetch after this many minutes... */
  dailyRetryMin: number;
  hourlyRetryMin: number;
  /** ...but only within this many minutes of the refresh mark (then wait for the next mark). */
  retryWindowMin: number;
}

export const DEFAULT_EQUITY_BAR_SCHEDULE: EquityBarSchedule = {
  dailySettleMin: 20,
  preOpenMin: 9 * 60,
  hourlySettleMin: 2,
  dailyRetryMin: 15,
  hourlyRetryMin: 5,
  retryWindowMin: 240,
};

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function nyMs(ymd: string, minutes: number): number {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return nyWallTimeToUtcMs(`${ymd} ${hh}:${mm}`) as number;
}

/** Daily-history refresh marks on a trading day: pre-open and session close + settle (13:00 close on early-close days). */
export function dailyRefreshMarksMs(ymd: string, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): number[] {
  if (!isUsTradingDay(ymd)) return [];
  return [nyMs(ymd, cfg.preOpenMin), nyMs(ymd, usSessionCloseMinutes(ymd) + cfg.dailySettleMin)];
}

/** 60min refresh marks on a trading day: pre-open, then every regular-session hourly close (10:00 … close) + settle. */
export function hourlyRefreshMarksMs(ymd: string, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): number[] {
  if (!isUsTradingDay(ymd)) return [];
  const marks = [nyMs(ymd, cfg.preOpenMin)];
  const close = usSessionCloseMinutes(ymd);
  for (let h = 10 * 60; h <= close; h += 60) marks.push(nyMs(ymd, h + cfg.hourlySettleMin));
  return marks;
}

function latestMark(nowMs: number, marksFor: (ymd: string) => number[]): number | null {
  let ymd = nyDateTime(nowMs).ymd;
  for (let i = 0; i < 15; i++, ymd = addDays(ymd, -1)) {
    const past = marksFor(ymd).filter((ms) => ms <= nowMs);
    if (past.length) return Math.max(...past);
  }
  return null;
}

// Marks depend only on (kind, day, schedule); the worker asks several times per symbol per cycle, so memoise them.
const markMemo = new Map<string, number[]>();
function memoMarks(kind: 'd' | 'h', ymd: string, cfg: EquityBarSchedule): number[] {
  const key = `${kind}|${ymd}|${cfg.preOpenMin}|${cfg.dailySettleMin}|${cfg.hourlySettleMin}`;
  let marks = markMemo.get(key);
  if (!marks) {
    marks = kind === 'd' ? dailyRefreshMarksMs(ymd, cfg) : hourlyRefreshMarksMs(ymd, cfg);
    if (markMemo.size > 500) markMemo.clear();
    markMemo.set(key, marks);
  }
  return marks;
}

export function latestDailyRefreshMarkMs(nowMs: number, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): number | null {
  return latestMark(nowMs, (ymd) => memoMarks('d', ymd, cfg));
}

export function latestHourlyRefreshMarkMs(nowMs: number, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): number | null {
  return latestMark(nowMs, (ymd) => memoMarks('h', ymd, cfg));
}

/** Last fetch of one series for one symbol. `complete` false = failed, empty or missing the expected final bar. */
export interface BarFetchState {
  fetchedAtMs: number;
  complete: boolean;
}

/**
 * Due when never fetched, when a refresh mark has passed since the last fetch, or when the last fetch was incomplete,
 * `retryMin` has elapsed and we are still within `retryWindowMin` of the latest mark.
 */
export function isBarRefreshDue(
  state: BarFetchState | null | undefined,
  latestMarkMs: number | null,
  nowMs: number,
  retryMin: number,
  retryWindowMin: number,
): boolean {
  if (!state) return true;
  if (latestMarkMs != null && state.fetchedAtMs < latestMarkMs) return true;
  if (state.complete) return false;
  if (nowMs - state.fetchedAtMs < retryMin * 60_000) return false;
  return latestMarkMs == null || nowMs - latestMarkMs <= retryWindowMin * 60_000;
}

/** A DAILY_ADJUSTED fetch is complete when it holds the latest session that had closed at fetch time. */
export function dailyHistoryComplete(bars: Array<{ timestamp: string }>, fetchedAtMs: number): boolean {
  if (!bars.length) return false;
  const last = bars.reduce((max, b) => (barDay(b) > max ? barDay(b) : max), '');
  return last >= lastCompletedUsSessionDate(fetchedAtMs);
}

/**
 * The session a live bar may be built for, or null. The live bar covers the latest opened session until the held
 * history was fetched after that session closed (then the fetched final bar wins until the next open).
 */
export function liveDailyBarSession(heldState: BarFetchState | null | undefined, nowMs: number): string | null {
  const { ymd, minutes } = nyDateTime(nowMs);
  const session = isUsTradingDay(ymd) && minutes >= 9 * 60 + 30 ? ymd : previousUsTradingDay(ymd);
  if (heldState?.complete && lastCompletedUsSessionDate(heldState.fetchedAtMs) >= session) return null;
  return session;
}

export function isDailyRefreshDue(state: BarFetchState | null | undefined, nowMs: number, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): boolean {
  return isBarRefreshDue(state, latestDailyRefreshMarkMs(nowMs, cfg), nowMs, cfg.dailyRetryMin, cfg.retryWindowMin);
}

export function isHourlyRefreshDue(state: BarFetchState | null | undefined, nowMs: number, cfg: EquityBarSchedule = DEFAULT_EQUITY_BAR_SCHEDULE): boolean {
  return isBarRefreshDue(state, latestHourlyRefreshMarkMs(nowMs, cfg), nowMs, cfg.hourlyRetryMin, cfg.retryWindowMin);
}

/** Schedule from env (WORKER_AV_* overrides), falling back to the defaults for anything missing or out of range. */
export function equityBarScheduleFromEnv(env: Record<string, string | undefined>): EquityBarSchedule {
  const int = (key: string, fallback: number, min: number, max: number) => {
    const n = Number.parseInt(String(env[key] ?? ''), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const d = DEFAULT_EQUITY_BAR_SCHEDULE;
  const preOpenRaw = /^(\d{1,2}):(\d{2})$/.exec(String(env.WORKER_AV_PREOPEN_REFRESH ?? '').trim());
  const preOpen = preOpenRaw ? Number(preOpenRaw[1]) * 60 + Number(preOpenRaw[2]) : NaN;
  return {
    dailySettleMin: int('WORKER_AV_DAILY_SETTLE_MINUTES', d.dailySettleMin, 0, 240),
    preOpenMin: Number.isFinite(preOpen) && preOpen >= 0 && preOpen < 9 * 60 + 30 ? preOpen : d.preOpenMin,
    hourlySettleMin: int('WORKER_AV_HOURLY_SETTLE_MINUTES', d.hourlySettleMin, 0, 30),
    dailyRetryMin: int('WORKER_AV_DAILY_RETRY_MINUTES', d.dailyRetryMin, 1, 240),
    hourlyRetryMin: int('WORKER_AV_HOURLY_RETRY_MINUTES', d.hourlyRetryMin, 1, 60),
    retryWindowMin: int('WORKER_AV_RETRY_WINDOW_MINUTES', d.retryWindowMin, 1, 24 * 60),
  };
}
