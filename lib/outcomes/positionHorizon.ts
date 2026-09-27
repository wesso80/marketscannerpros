/**
 * Pure rules for the 6-week and 12-week position horizons on ai_signal_log (migration 105, filled by
 * lib/outcomes/positionHorizonLabeller.ts from /api/cron/label-ai-outcomes).
 *
 * Horizons are CALENDAR days (6w = 42, 12w = 84) so equities and crypto are measured over the same span of time:
 * about 29-30 / 58-60 US trading sessions, 42 / 84 daily bars for crypto.
 *
 * Measured on DAILY bars:
 *   - window: completed daily bars that OPEN at or after signal_at (the signal day's bar is left out when the call
 *     was made during it: its high/low include prices from before the call), up to and including the first bar that
 *     closes at or after signal_at + horizon. That bar's close is the exit price.
 *   - pending until that exit bar exists and has closed. Nothing is labelled early.
 *   - entry = price_at_signal, stop = stop_loss, target = target_1 as logged with the call.
 *   - first hit: the first bar whose low/high touches the stop or the target. A bar touching both cannot be ordered
 *     from daily data: 'both_same_day', counted as the stop (conservative). A bar that OPENS through a level fills at
 *     the open (gap), so a gap through the stop is worse than -1R.
 *   - R: risk = |entry - stop|. Stop first = -1R (or the gap fill), target first = target R (or the gap fill),
 *     neither = the exit close in R. No valid stop = no R.
 *   - outcome: correct / wrong / neutral on the exit close, 1% threshold (same rule as the 4h / 24h horizons).
 * Longs and shorts are mirror images.
 */
import { nyWallTimeToUtcMs } from '@/lib/time/nyWallClock';
import { usSessionCloseMinutes } from '@/lib/time/usSession';
import { classifyOutcome, pctMove, type OutcomeLabel, type SignalDirection } from './aiOutcomeLabel';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PositionHorizon = '6w' | '12w';
export const POSITION_HORIZONS: readonly PositionHorizon[] = ['6w', '12w'];
/** Calendar days per horizon. */
export const POSITION_HORIZON_DAYS: Record<PositionHorizon, number> = { '6w': 42, '12w': 84 };
/** Past the horizon by this long and still no exit bar (or no bars at all): give up with outcome 'no_data'. */
export const POSITION_GIVE_UP_AFTER_MS = 30 * DAY_MS;
/** First window bar opening this far (fraction) from the entry price = a split or a bad entry price: not measured. */
export const MAX_ENTRY_GAP_FRACTION = 0.5;
/** A bar whose close sits this far (fraction) outside its own high/low mixes adjusted and raw prices (a split). */
export const MAX_CLOSE_OUTSIDE_RANGE = 0.05;

export interface DailyOhlcBar {
  /** Session / UTC day, YYYY-MM-DD. */
  day: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type FirstHit = 'target' | 'stop' | 'both_same_day' | 'neither' | 'no_levels';

export interface PositionHorizonInput {
  direction: SignalDirection;
  entry: number;
  signalAtMs: number;
  stop: number | null;
  target: number | null;
  bars: readonly DailyOhlcBar[];
  nowMs: number;
  horizon: PositionHorizon;
}

export interface PositionHorizonMeasured {
  status: 'measured';
  outcome: OutcomeLabel;
  exitPrice: number;
  exitAt: number;
  /** Raw close-to-entry move, % (like pct_move_24h: a correct SHORT is negative). */
  pctMove: number;
  maxPrice: number;
  minPrice: number;
  /** Favourable excursion in the call's direction, % (>= 0 when price went the called way at some point). */
  mfePct: number;
  /** Adverse excursion against the call, % (<= 0 when price went against the call at some point). */
  maePct: number;
  firstHit: FirstHit;
  firstHitDay: string | null;
  rMultiple: number | null;
  bars: number;
}

export type PositionHorizonResult =
  | { status: 'pending'; reason: string }
  | { status: 'no_data'; reason: string }
  | PositionHorizonMeasured;

export function positionHorizonTargetMs(signalAtMs: number, horizon: PositionHorizon): number {
  return signalAtMs + POSITION_HORIZON_DAYS[horizon] * DAY_MS;
}

const round4 = (n: number) => Math.max(-999999, Math.min(999999, Math.round(n * 10000) / 10000));
const pos = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** Stop / target usable for this direction and entry (stop on the losing side, target on the winning side). */
export function validLevels(direction: SignalDirection, entry: number, stop: number | null, target: number | null) {
  const s = pos(stop);
  const t = pos(target);
  const long = direction === 'LONG';
  const stopOk = s !== null && (long ? s < entry : s > entry);
  const targetOk = t !== null && (long ? t > entry : t < entry);
  return { stop: stopOk ? s : null, target: stopOk && targetOk ? t : null };
}

export function measurePositionHorizon(input: PositionHorizonInput): PositionHorizonResult {
  const { direction, entry, signalAtMs, nowMs, horizon } = input;
  const long = direction === 'LONG';
  const targetMs = positionHorizonTargetMs(signalAtMs, horizon);
  const giveUp = nowMs >= targetMs + POSITION_GIVE_UP_AFTER_MS;
  if (!(entry > 0) || !Number.isFinite(signalAtMs)) return { status: 'no_data', reason: 'no entry price' };
  if (targetMs > nowMs) return { status: 'pending', reason: 'horizon not reached' };

  const bars = input.bars
    .filter((b) => b.closeTime <= nowMs && b.high > 0 && b.low > 0 && b.close > 0 && b.open > 0 && b.high >= b.low)
    .slice()
    .sort((a, b) => a.openTime - b.openTime);
  if (!bars.length) {
    return giveUp ? { status: 'no_data', reason: 'no daily bars' } : { status: 'pending', reason: 'no daily bars yet' };
  }
  // The series must reach back to the call: some bar has to start at or before signal_at.
  if (bars[0].openTime > signalAtMs) return { status: 'no_data', reason: 'daily history starts after the signal' };

  const window: DailyOhlcBar[] = [];
  let exit: DailyOhlcBar | null = null;
  for (const b of bars) {
    if (b.openTime < signalAtMs) continue;
    window.push(b);
    if (b.closeTime >= targetMs) { exit = b; break; }
  }
  if (!exit) {
    return giveUp
      ? { status: 'no_data', reason: 'daily bars stop before the horizon' }
      : { status: 'pending', reason: 'waiting for the horizon bar' };
  }
  if (Math.abs(window[0].open / entry - 1) > MAX_ENTRY_GAP_FRACTION) {
    return { status: 'no_data', reason: 'first bar is >50% from the entry price (split or bad entry)' };
  }
  const mixed = window.find((b) => b.close > b.high * (1 + MAX_CLOSE_OUTSIDE_RANGE) || b.close < b.low * (1 - MAX_CLOSE_OUTSIDE_RANGE));
  if (mixed) return { status: 'no_data', reason: `adjusted/raw price mismatch on ${mixed.day} (split?)` };

  const levels = validLevels(direction, entry, input.stop, input.target);
  const risk = levels.stop !== null ? Math.abs(entry - levels.stop) : null;
  const toR = (price: number) => (risk ? ((long ? price - entry : entry - price) / risk) : null);

  let maxPrice = -Infinity;
  let minPrice = Infinity;
  let firstHit: FirstHit = levels.stop === null ? 'no_levels' : 'neither';
  let firstHitDay: string | null = null;
  let fill: number | null = null;
  for (const b of window) {
    maxPrice = Math.max(maxPrice, b.high);
    minPrice = Math.min(minPrice, b.low);
    if (firstHit !== 'neither' || levels.stop === null) continue;
    const s = levels.stop;
    const t = levels.target;
    const stopTouched = long ? b.low <= s : b.high >= s;
    const targetTouched = t !== null && (long ? b.high >= t : b.low <= t);
    if (!stopTouched && !targetTouched) continue;
    firstHitDay = b.day;
    const gapThroughStop = long ? b.open <= s : b.open >= s;
    const gapThroughTarget = t !== null && (long ? b.open >= t : b.open <= t);
    if (gapThroughStop) { firstHit = 'stop'; fill = b.open; }
    else if (gapThroughTarget) { firstHit = 'target'; fill = b.open; }
    else if (stopTouched && targetTouched) { firstHit = 'both_same_day'; fill = s; }
    else if (stopTouched) { firstHit = 'stop'; fill = s; }
    else { firstHit = 'target'; fill = t; }
  }

  const move = pctMove(entry, exit.close);
  const rRaw = fill !== null ? toR(fill) : toR(exit.close);
  return {
    status: 'measured',
    outcome: classifyOutcome(direction, move),
    exitPrice: exit.close,
    exitAt: exit.closeTime,
    pctMove: move,
    maxPrice,
    minPrice,
    mfePct: round4(long ? ((maxPrice - entry) / entry) * 100 : ((entry - minPrice) / entry) * 100),
    maePct: round4(long ? ((minPrice - entry) / entry) * 100 : ((entry - maxPrice) / entry) * 100),
    firstHit,
    firstHitDay,
    rMultiple: rRaw === null ? null : round4(rRaw),
    bars: window.length,
  };
}

// ---------------------------------------------------------------------------
// Daily bars → DailyOhlcBar[]
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** US equity daily bars (date = NY session date) → bars from the 09:30 open to the 16:00 (or early) close, NY time. */
export function equityDailyToOhlcBars(bars: readonly { date: string; open: number; high: number; low: number; close: number }[]): DailyOhlcBar[] {
  const out: DailyOhlcBar[] = [];
  for (const b of bars) {
    const day = String(b.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(b.close > 0)) continue;
    const closeMin = usSessionCloseMinutes(day);
    const hh = String(Math.floor(closeMin / 60)).padStart(2, '0');
    const mm = String(closeMin % 60).padStart(2, '0');
    const openTime = nyWallTimeToUtcMs(`${day} 09:30:00`);
    const closeTime = nyWallTimeToUtcMs(`${day} ${hh}:${mm}:00`);
    if (openTime === null || closeTime === null) continue;
    out.push({
      day, openTime, closeTime,
      open: b.open > 0 ? b.open : b.close,
      high: b.high > 0 ? b.high : b.close,
      low: b.low > 0 ? b.low : b.close,
      close: b.close,
    });
  }
  return out.sort((a, b) => a.openTime - b.openTime);
}

/** DIGITAL_CURRENCY_DAILY → bars. A crypto day D runs 00:00 UTC to D+1 00:00 UTC. Old and new AV key formats. */
export function parseAvCryptoDailyOhlc(json: unknown): DailyOhlcBar[] {
  if (!json || typeof json !== 'object') return [];
  const obj = json as Record<string, unknown>;
  const seriesKey = Object.keys(obj).find((k) => k.startsWith('Time Series'));
  const series = seriesKey ? (obj[seriesKey] as Record<string, Record<string, unknown>> | undefined) : undefined;
  if (!series || typeof series !== 'object') return [];
  const pick = (row: Record<string, unknown>, n: number, name: string) =>
    num(row[`${n}. ${name}`]) ?? num(row[`${n}a. ${name} (USD)`]) ?? num(row[`${n}b. ${name} (USD)`]);
  const out: DailyOhlcBar[] = [];
  for (const [date, raw] of Object.entries(series)) {
    const row = raw ?? {};
    const day = date.slice(0, 10);
    const openTime = Date.parse(`${day}T00:00:00Z`);
    const close = pick(row, 4, 'close');
    if (close === null || close <= 0 || !Number.isFinite(openTime)) continue;
    const open = pick(row, 1, 'open') ?? close;
    const high = pick(row, 2, 'high') ?? Math.max(open, close);
    const low = pick(row, 3, 'low') ?? Math.min(open, close);
    out.push({ day, openTime, closeTime: openTime + DAY_MS, open, high, low, close });
  }
  return out.sort((a, b) => a.openTime - b.openTime);
}

/** Merge two daily series by day; `preferred` wins on the same day. */
export function mergeDailyBars(preferred: readonly DailyOhlcBar[], extra: readonly DailyOhlcBar[]): DailyOhlcBar[] {
  const byDay = new Map<string, DailyOhlcBar>();
  for (const b of extra) byDay.set(b.day, b);
  for (const b of preferred) byDay.set(b.day, b);
  return [...byDay.values()].sort((a, b) => a.openTime - b.openTime);
}
