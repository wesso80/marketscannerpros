/**
 * Position-trade levels ("Position (weekly/daily)") for 6+ week holds, per the trading team's approved plan
 * (weekly = main timeframe, daily = entry, monthly = context).
 *
 * The shared admin scan runs on 15-minute bars, so its entry/stop/targets are intraday levels (a stop about $1
 * away on a $568 stock, which ordinary daily noise takes out). The admin decision pages show these levels as the
 * main levels and keep the 15m levels as a secondary "Intraday timing (15m)" line.
 *
 * Built only from DAILY bars already cached for the scan (weekly and monthly bars are derived from them; no extra
 * weekly/monthly fetch). Long and short are exact mirrors (defaults in POSITION_LEVEL_DEFAULTS):
 *   - Daily ATR = ATR(14) on daily bars (Wilder / TradingView ta.atr, lib/indicators). Used only for buffers/zones.
 *   - Entry trigger (daily): the most recent daily swing high (long) / swing low (short) in the last 20 completed
 *     daily bars (a swing beats the 2 bars either side; none = the 20-bar high/low). Entry is a daily CLOSE through
 *     it. Entry zone = trigger to trigger + 0.5 x daily ATR (long) / trigger - 0.5 x ATR to trigger (short); above
 *     the zone = don't chase. R is measured from the trigger.
 *   - Stop (weekly): beyond the latest weekly swing low (long) / swing high (short) below / above the trigger, minus
 *     / plus a 0.5 x daily ATR buffer. Weekly swing = a week whose low (high) beats the 2 weeks either side; none =
 *     the lowest weekly low (highest weekly high) in the data.
 *   - Targets (weekly/monthly): weekly swing highs, the weekly range high and completed-month highs above the
 *     trigger (long; lows below for short). TP1 = the nearest of those at least 1.5R away (room for a multi-week
 *     move); nearer levels are listed as obstacles. If none reaches 1.5R, TP1 = the furthest level in the data,
 *     flagged "below 1.5R". TP2/TP3 = the next levels; when the data runs out (e.g. at a high) the rest are
 *     2R / 3R / 4R projections, labelled as projections.
 *   - Expected hold: 6+ weeks (review at 6 and 12 weeks).
 *   - No usable data (no / too few daily bars, too few weeks, bars older than 7 days, or bars disagreeing with the
 *     current price by > 25%, e.g. an unadjusted split): status "unavailable" with the reason. Never a fallback to
 *     the 15m levels.
 *
 * Pure and dependency-light so client components can import the view helpers.
 */
import { atr as atrIndicator } from "@/lib/indicators";

export const POSITION_LEVELS_LABEL = "Position (weekly/daily)" as const;
export const INTRADAY_LEVELS_LABEL = "Intraday timing (15m)" as const;
export const POSITION_LEVELS_UNAVAILABLE = "Position levels unavailable (no daily data)";
export const EXPECTED_HOLD = "6+ weeks (review at 6 and 12 weeks)";

export interface PositionLevelParams {
  /** ATR length on daily bars (buffers and entry zone). */
  atrPeriod: number;
  /** Buffer beyond the weekly swing for the stop, in daily ATRs. */
  stopBufferAtr: number;
  /** Weeks either side a weekly swing low/high must beat. */
  weeklyPivotStrength: number;
  /** Days either side a daily swing (entry trigger) must beat. */
  dailyPivotStrength: number;
  /** Completed daily bars searched for the entry trigger (~1 trading month). */
  triggerLookbackBars: number;
  /** Entry zone width beyond the trigger, in daily ATRs. */
  entryZoneAtr: number;
  /** Minimum reward:risk for TP1; below it the target is flagged "below 1.5R". */
  minRewardR: number;
  /** Projections used when fewer than three weekly/monthly levels lie beyond entry. */
  projectionRMultiples: [number, number, number];
  /** Levels closer together than this (daily ATRs) count as one. */
  levelMergeAtr: number;
  /** Stop closer than this many daily ATRs is flagged tightStop (inside normal daily noise). */
  tightStopAtr: number;
  /** TP1 closer than this many daily ATRs is flagged: could be only days away, not a multi-week move. */
  targetTooCloseAtr: number;
  /** Fewer weekly bars than this = no weekly structure, levels unavailable. */
  minWeeklyBars: number;
  /** Newest daily bar older than this (calendar days) = stale, levels unavailable. */
  maxDailyAgeDays: number;
  /** Current price further than this fraction from the last daily close = bars unusable (e.g. unadjusted split). */
  maxPriceDivergence: number;
}

export const POSITION_LEVEL_DEFAULTS: Readonly<PositionLevelParams> = Object.freeze({
  atrPeriod: 14,
  stopBufferAtr: 0.5,
  weeklyPivotStrength: 2,
  dailyPivotStrength: 2,
  triggerLookbackBars: 20,
  entryZoneAtr: 0.5,
  minRewardR: 1.5,
  projectionRMultiples: [2, 3, 4] as [number, number, number],
  levelMergeAtr: 0.25,
  tightStopAtr: 1,
  targetTooCloseAtr: 3,
  minWeeklyBars: 6,
  maxDailyAgeDays: 7,
  maxPriceDivergence: 0.25,
});

export type PositionDirection = "LONG" | "SHORT";
/** waiting = no daily close through the trigger yet; in_zone = closed through, price still in the entry zone;
 *  past_zone = price beyond the zone (don't chase); beyond_stop = price already through the stop. */
export type EntryStatus = "waiting" | "in_zone" | "past_zone" | "beyond_stop";

export interface PositionTarget {
  price: number;
  /** Reward in R from the trigger. */
  r: number;
  /** "weekly" / "monthly" chart level, or an R "projection" when no level is left in the data. */
  timeframe: "weekly" | "monthly" | "projection";
  /** e.g. "weekly swing high", "Aug 2026 monthly high", "3R projection". */
  source: string;
}

export interface DirectionalPositionLevels {
  direction: PositionDirection;
  /** Daily entry trigger: enter on a daily close through it. R is measured from here. */
  trigger: number;
  triggerSource: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  entryStatus: EntryStatus;
  entryNote: string;
  stop: number;
  /** Weekly swing (or weekly range extreme) the stop sits beyond. */
  stopLevel: number;
  stopSource: string;
  /** Monday (YYYY-MM-DD) of the week that made the stop level. */
  stopWeekOf: string | null;
  riskPerUnit: number;
  /** 1R as a percent of the trigger. */
  riskPct: number;
  /** 1R in daily ATRs. */
  stopAtr: number;
  tightStop: boolean;
  targets: PositionTarget[];
  /** Weekly/monthly levels between the trigger and TP1 (nearer than 1.5R): likely resistance/support on the way. */
  obstacles: PositionTarget[];
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tp1R: number | null;
  /** TP1 gives less than minRewardR (1.5R): no weekly/monthly level in the data leaves enough room. */
  belowMinR: boolean;
  /** TP1 within targetTooCloseAtr daily ATRs: may be only days away. */
  targetTooClose: boolean;
}

export interface PositionLevels {
  version: 2;
  label: typeof POSITION_LEVELS_LABEL;
  /** Structure timeframe / entry timeframe. */
  timeframe: "1W/1D";
  status: "ok" | "unavailable";
  reason: string | null;
  params: PositionLevelParams;
  expectedHold: string;
  dailyBars: number;
  weeklyBars: number;
  monthlyBars: number;
  /** Date of the newest daily bar (YYYY-MM-DD). */
  dailyAsOf: string | null;
  /** Date of the newest COMPLETED daily close used for the entry check. */
  lastDailyCloseDate: string | null;
  lastDailyClose: number | null;
  /** Price the entry status is judged at (scan price, else last daily close). */
  price: number | null;
  atr: number | null;
  atrPct: number | null;
  long: DirectionalPositionLevels | null;
  short: DirectionalPositionLevels | null;
}

export interface DailyBarLike {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface AggBar { key: string; open: number; high: number; low: number; close: number }

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function finitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Round to a price precision that keeps sub-cent coins meaningful. */
export function roundPrice(n: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  if (abs >= 1) return Math.round(n * 10_000) / 10_000;
  if (abs === 0) return 0;
  return Number(n.toPrecision(6));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function barDateMs(ts: string): number {
  const text = String(ts ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T00:00:00Z`) : Date.parse(text);
}

function dateOf(ts: string): string {
  return new Date(barDateMs(ts)).toISOString().slice(0, 10);
}

function cleanDailyBars(bars: readonly DailyBarLike[] | null | undefined): DailyBarLike[] {
  const byDate = new Map<string, DailyBarLike>();
  for (const b of bars ?? []) {
    if (!b || !finitePositive(b.high) || !finitePositive(b.low) || !finitePositive(b.close) || b.high < b.low) continue;
    if (!Number.isFinite(barDateMs(b.timestamp))) continue;
    byDate.set(dateOf(b.timestamp), b);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, b]) => b);
}

/** Monday (UTC) of the week a daily bar belongs to, YYYY-MM-DD. */
export function weekKey(ts: string): string {
  const ms = barDateMs(ts);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(ms - dow * DAY_MS).toISOString().slice(0, 10);
}

function aggregate(bars: readonly DailyBarLike[], keyOf: (ts: string) => string): AggBar[] {
  const out: AggBar[] = [];
  for (const b of bars) {
    const key = keyOf(b.timestamp);
    const cur = out[out.length - 1];
    if (cur && cur.key === key) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    } else {
      out.push({ key, open: finitePositive(b.open) ? b.open : b.close, high: b.high, low: b.low, close: b.close });
    }
  }
  return out;
}

/** Weekly bars (Monday-keyed) from daily bars, oldest first. The newest may be a forming week. */
export function dailyToWeekly(bars: readonly DailyBarLike[]): AggBar[] {
  return aggregate(cleanDailyBars(bars), weekKey);
}

/** Monthly bars (YYYY-MM keyed) from daily bars, oldest first. The newest may be a forming month. */
export function dailyToMonthly(bars: readonly DailyBarLike[]): AggBar[] {
  return aggregate(cleanDailyBars(bars), (ts) => dateOf(ts).slice(0, 7));
}

/** Indices of swing lows / highs in the last `lookback` bars (a swing beats `strength` bars either side). */
export function findSwings(bars: ReadonlyArray<{ high: number; low: number }>, side: "low" | "high", lookback: number, strength: number): number[] {
  const n = bars.length;
  const out: number[] = [];
  for (let i = Math.max(strength, n - lookback); i <= n - 1 - strength; i++) {
    const v = side === "low" ? bars[i].low : bars[i].high;
    let ok = true;
    for (let k = 1; k <= strength && ok; k++) {
      const l = side === "low" ? bars[i - k].low : bars[i - k].high;
      const r = side === "low" ? bars[i + k].low : bars[i + k].high;
      if (side === "low" ? !(v < l && v <= r) : !(v > l && v >= r)) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

function unavailable(reason: string, p: PositionLevelParams, extra: Partial<PositionLevels> = {}): PositionLevels {
  return {
    version: 2, label: POSITION_LEVELS_LABEL, timeframe: "1W/1D", status: "unavailable", reason, params: p,
    expectedHold: EXPECTED_HOLD, dailyBars: 0, weeklyBars: 0, monthlyBars: 0, dailyAsOf: null,
    lastDailyCloseDate: null, lastDailyClose: null, price: null, atr: null, atrPct: null, long: null, short: null,
    ...extra,
  };
}

function directional(input: {
  direction: PositionDirection;
  completed: readonly DailyBarLike[];
  weekly: readonly AggBar[];
  months: readonly AggBar[];
  price: number;
  lastClose: number;
  atr: number;
  p: PositionLevelParams;
}): DirectionalPositionLevels | null {
  const { direction, completed, weekly, months, price, lastClose, atr, p } = input;
  const long = direction === "LONG";
  const beyond = (a: number, b: number) => (long ? a > b : a < b); // a is further in the trade direction than b

  // Entry trigger: latest daily swing high (long) / low (short) in the completed lookback window.
  const dSwings = findSwings(completed, long ? "high" : "low", p.triggerLookbackBars, p.dailyPivotStrength);
  let trigger: number;
  let triggerSource: string;
  if (dSwings.length) {
    const i = dSwings[dSwings.length - 1];
    trigger = long ? completed[i].high : completed[i].low;
    triggerSource = `daily swing ${long ? "high" : "low"} ${dateOf(completed[i].timestamp)}`;
  } else {
    const win = completed.slice(-p.triggerLookbackBars - 1, -1);
    if (win.length === 0) return null;
    trigger = long ? Math.max(...win.map((b) => b.high)) : Math.min(...win.map((b) => b.low));
    triggerSource = `${win.length}-day ${long ? "high" : "low"}`;
  }

  // Stop: beyond the latest weekly swing on the far side of the trigger, plus a daily-ATR buffer.
  const wIdx = findSwings(weekly, long ? "low" : "high", weekly.length, p.weeklyPivotStrength)
    .filter((i) => beyond(trigger, long ? weekly[i].low : weekly[i].high));
  let stopLevel: number;
  let stopSource: string;
  let stopWeekOf: string | null;
  if (wIdx.length) {
    const i = wIdx[wIdx.length - 1];
    stopLevel = long ? weekly[i].low : weekly[i].high;
    stopSource = `weekly swing ${long ? "low" : "high"}`;
    stopWeekOf = weekly[i].key;
  } else {
    let best: AggBar | null = null;
    for (const w of weekly) if (!best || beyond(long ? best.low : best.high, long ? w.low : w.high)) best = w;
    if (!best || !beyond(trigger, long ? best.low : best.high)) return null;
    stopLevel = long ? best.low : best.high;
    stopSource = `weekly range ${long ? "low" : "high"} (no weekly swing in data)`;
    stopWeekOf = best.key;
  }
  const stop = long ? stopLevel - p.stopBufferAtr * atr : stopLevel + p.stopBufferAtr * atr;
  if (!(stop > 0)) return null;
  const risk = Math.abs(trigger - stop);
  if (!(risk > 0)) return null;

  // Targets: weekly swings and completed-month extremes beyond the trigger, nearest first, merged when close.
  const candidates: Array<{ price: number; timeframe: "weekly" | "monthly"; source: string }> = [];
  for (const i of findSwings(weekly, long ? "high" : "low", weekly.length, p.weeklyPivotStrength)) {
    candidates.push({ price: long ? weekly[i].high : weekly[i].low, timeframe: "weekly", source: `weekly swing ${long ? "high" : "low"} (wk of ${weekly[i].key})` });
  }
  if (weekly.length) {
    const ext = long ? Math.max(...weekly.map((w) => w.high)) : Math.min(...weekly.map((w) => w.low));
    candidates.push({ price: ext, timeframe: "weekly", source: `weekly range ${long ? "high" : "low"}` });
  }
  for (const m of months) {
    const [y, mo] = m.key.split("-");
    candidates.push({ price: long ? m.high : m.low, timeframe: "monthly", source: `${MONTHS[Number(mo) - 1]} ${y} monthly ${long ? "high" : "low"}` });
  }
  const levels = candidates
    .filter((c) => beyond(c.price, trigger))
    .sort((a, b) => Math.abs(a.price - trigger) - Math.abs(b.price - trigger));
  const merged: typeof levels = [];
  for (const c of levels) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(c.price - prev.price) < p.levelMergeAtr * atr) {
      // Keep the further of two near-identical levels; prefer the monthly label (higher timeframe).
      if (beyond(c.price, prev.price)) prev.price = c.price;
      if (c.timeframe === "monthly") { prev.timeframe = "monthly"; prev.source = c.source; }
      continue;
    }
    merged.push({ ...c });
  }
  const toTarget = (c: (typeof merged)[number]): PositionTarget => ({
    price: roundPrice(c.price),
    r: round2(Math.abs(c.price - trigger) / risk),
    timeframe: c.timeframe,
    source: c.source,
  });
  // TP1 = the nearest level with room for a multi-week move (>= minRewardR); nearer levels are listed as
  // obstacles. No level reaches it: TP1 = the furthest level in the data, flagged "below 1.5R".
  const firstRoomy = merged.findIndex((c) => Math.abs(c.price - trigger) / risk >= p.minRewardR);
  const picked = firstRoomy >= 0 ? merged.slice(firstRoomy, firstRoomy + 3) : merged.slice(-1);
  const obstacles = (firstRoomy >= 0 ? merged.slice(0, firstRoomy) : merged.slice(0, -1)).map(toTarget);
  const targets: PositionTarget[] = picked.map(toTarget);
  // Projections at least 0.5R beyond the previous target: the smallest default multiple that fits, then +1R steps.
  const maxDefault = Math.max(...p.projectionRMultiples);
  while (targets.length < 3) {
    const lastR = targets.length ? targets[targets.length - 1].r : 0;
    const r = p.projectionRMultiples.find((m) => m >= lastR + 0.5) ?? Math.max(maxDefault, Math.ceil(lastR + 0.5));
    const t = long ? trigger + r * risk : trigger - r * risk;
    if (!(t > 0)) break;
    targets.push({ price: roundPrice(t), r, timeframe: "projection", source: `${r}R projection (no further weekly/monthly level in data)` });
  }

  // Entry status on the last COMPLETED daily close; chase check on the current price.
  const zoneEdge = long ? trigger + p.entryZoneAtr * atr : trigger - p.entryZoneAtr * atr;
  const closedThrough = beyond(lastClose, trigger);
  let entryStatus: EntryStatus;
  let entryNote: string;
  const fmt = (n: number) => String(roundPrice(n));
  if (!beyond(price, stop)) {
    entryStatus = "beyond_stop";
    entryNote = `Price is already through the stop (${fmt(stop)}): no entry.`;
  } else if (!closedThrough) {
    entryStatus = "waiting";
    entryNote = `Enter on a daily close ${long ? "above" : "below"} ${fmt(trigger)} (entry zone ${fmt(Math.min(trigger, zoneEdge))}-${fmt(Math.max(trigger, zoneEdge))}).`;
  } else if (beyond(price, zoneEdge)) {
    entryStatus = "past_zone";
    entryNote = `Daily close went through ${fmt(trigger)} but price is past the entry zone (${fmt(zoneEdge)}): don't chase.`;
  } else {
    entryStatus = "in_zone";
    entryNote = `Daily close through ${fmt(trigger)}; price is inside the entry zone (up to ${fmt(zoneEdge)}).`;
  }

  const tp1 = targets[0] ?? null;
  return {
    direction,
    trigger: roundPrice(trigger),
    triggerSource,
    entryZoneLow: roundPrice(Math.min(trigger, zoneEdge)),
    entryZoneHigh: roundPrice(Math.max(trigger, zoneEdge)),
    entryStatus,
    entryNote,
    stop: roundPrice(stop),
    stopLevel: roundPrice(stopLevel),
    stopSource,
    stopWeekOf,
    riskPerUnit: roundPrice(risk),
    riskPct: round2((risk / trigger) * 100),
    stopAtr: round2(risk / atr),
    tightStop: risk / atr < p.tightStopAtr,
    targets,
    obstacles,
    tp1: targets[0]?.price ?? null,
    tp2: targets[1]?.price ?? null,
    tp3: targets[2]?.price ?? null,
    tp1R: tp1?.r ?? null,
    belowMinR: tp1 != null && tp1.r < p.minRewardR,
    targetTooClose: tp1 != null && Math.abs(tp1.price - trigger) / atr < p.targetTooCloseAtr,
  };
}

/**
 * Weekly/daily position levels for both directions from daily bars.
 * - `price`: the scan's current price (entry-zone / chase check); falls back to the last daily close.
 * - `completedThrough`: the newest daily bar date (YYYY-MM-DD) that is a completed session; newer bars are
 *   forming and are not used for the "daily close through the trigger" check or the trigger swing.
 */
export function computePositionLevels(input: {
  dailyBars: readonly DailyBarLike[] | null | undefined;
  price?: number | null;
  completedThrough?: string | null;
  nowMs?: number;
  params?: Partial<PositionLevelParams>;
}): PositionLevels {
  const p: PositionLevelParams = { ...POSITION_LEVEL_DEFAULTS, ...(input.params ?? {}) };
  const bars = cleanDailyBars(input.dailyBars);
  if (bars.length === 0) return unavailable("no daily data", p);
  const last = bars[bars.length - 1];
  const dailyAsOf = dateOf(last.timestamp);
  const weekly = dailyToWeekly(bars);
  const monthlyAll = dailyToMonthly(bars);
  const base = { dailyBars: bars.length, weeklyBars: weekly.length, monthlyBars: monthlyAll.length, dailyAsOf };
  const minBars = p.atrPeriod + 1;
  if (bars.length < minBars) return unavailable(`only ${bars.length} daily bars; ATR(${p.atrPeriod}) needs ${minBars}`, p, base);
  if (weekly.length < p.minWeeklyBars) return unavailable(`only ${weekly.length} weeks of daily history; weekly structure needs ${p.minWeeklyBars}`, p, base);
  const nowMs = input.nowMs ?? Date.now();
  if ((nowMs - barDateMs(last.timestamp)) / DAY_MS > p.maxDailyAgeDays) return unavailable(`stale daily data (newest daily bar ${dailyAsOf})`, p, base);

  const completed = input.completedThrough
    ? bars.filter((b) => dateOf(b.timestamp) <= (input.completedThrough as string))
    : bars;
  if (completed.length < minBars) return unavailable("not enough completed daily bars", p, base);
  const lastDone = completed[completed.length - 1];
  const price = finitePositive(input.price) ? input.price : last.close;
  if (Math.abs(price / last.close - 1) > p.maxPriceDivergence) {
    return unavailable(`daily bars disagree with the current price (last daily close ${roundPrice(last.close)} vs ${roundPrice(price)}; possible split or bad data)`, p, base);
  }
  const atr = atrIndicator(bars.map((b) => ({ timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 })), p.atrPeriod);
  if (!finitePositive(atr)) return unavailable("daily ATR could not be computed", p, base);
  // Monthly context levels: completed months only (the newest month is forming).
  const months = monthlyAll.slice(0, -1);

  const args = { completed, weekly, months, price, lastClose: lastDone.close, atr, p };
  return {
    version: 2,
    label: POSITION_LEVELS_LABEL,
    timeframe: "1W/1D",
    status: "ok",
    reason: null,
    params: p,
    expectedHold: EXPECTED_HOLD,
    ...base,
    lastDailyCloseDate: dateOf(lastDone.timestamp),
    lastDailyClose: roundPrice(lastDone.close),
    price: roundPrice(price),
    atr: roundPrice(atr),
    atrPct: round2((atr / price) * 100),
    long: directional({ direction: "LONG", ...args }),
    short: directional({ direction: "SHORT", ...args }),
  };
}

/* ── View for pages / edge packets / hits ─────────────────── */

export type PositionLevelViewStatus = "ok" | "unavailable" | "no_direction" | "not_computed";

/** The direction-matched levels a page or bot reads (flat apart from `targets`). */
export interface PositionLevelView {
  label: typeof POSITION_LEVELS_LABEL;
  timeframe: "1W/1D";
  status: PositionLevelViewStatus;
  /** Human-readable line when status is not "ok". */
  message: string | null;
  direction: PositionDirection | null;
  expectedHold: string;
  entryTrigger: number | null;
  triggerSource: string | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  entryStatus: EntryStatus | null;
  entryNote: string | null;
  stop: number | null;
  stopLevel: number | null;
  stopSource: string | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tp1R: number | null;
  targets: PositionTarget[];
  obstacles: PositionTarget[];
  riskPerUnit: number | null;
  riskPct: number | null;
  stopAtr: number | null;
  belowMinR: boolean;
  targetTooClose: boolean;
  tightStop: boolean;
  minRewardR: number;
  atr: number | null;
  atrPct: number | null;
  atrPeriod: number;
  dailyAsOf: string | null;
  lastDailyCloseDate: string | null;
}

export function biasToDirection(bias: string | null | undefined): PositionDirection | null {
  const b = String(bias ?? "").toUpperCase();
  if (b === "LONG" || b === "BULLISH" || b === "BULLISH_RESEARCH") return "LONG";
  if (b === "SHORT" || b === "BEARISH" || b === "BEARISH_RESEARCH") return "SHORT";
  return null;
}

function isCurrentLevels(levels: unknown): levels is PositionLevels {
  return !!levels && typeof levels === "object" && (levels as PositionLevels).version === 2 && "status" in (levels as object);
}

/** Direction-matched view. Missing (or an older format) = saved before these levels existed ("not_computed"). */
export function positionLevelView(levels: PositionLevels | null | undefined, bias: string | null | undefined): PositionLevelView {
  const current = isCurrentLevels(levels) ? levels : null;
  const p = current?.params ?? POSITION_LEVEL_DEFAULTS;
  const empty: PositionLevelView = {
    label: POSITION_LEVELS_LABEL, timeframe: "1W/1D", status: "not_computed", message: null, direction: null,
    expectedHold: EXPECTED_HOLD, entryTrigger: null, triggerSource: null, entryZoneLow: null, entryZoneHigh: null,
    entryStatus: null, entryNote: null, stop: null, stopLevel: null, stopSource: null, tp1: null, tp2: null, tp3: null,
    tp1R: null, targets: [], obstacles: [], riskPerUnit: null, riskPct: null, stopAtr: null, belowMinR: false, targetTooClose: false,
    tightStop: false, minRewardR: p.minRewardR, atr: current?.atr ?? null, atrPct: current?.atrPct ?? null,
    atrPeriod: p.atrPeriod, dailyAsOf: current?.dailyAsOf ?? null, lastDailyCloseDate: current?.lastDailyCloseDate ?? null,
  };
  if (!current) {
    return { ...empty, message: "Position levels not in this saved result yet (saved before weekly/daily levels were added; the next scan adds them)" };
  }
  if (current.status !== "ok") {
    const reason = current.reason && current.reason !== "no daily data" ? current.reason : null;
    return { ...empty, status: "unavailable", message: reason ? `Position levels unavailable (${reason})` : POSITION_LEVELS_UNAVAILABLE };
  }
  const direction = biasToDirection(bias);
  if (!direction) {
    return { ...empty, status: "no_direction", message: "No position levels: neutral bias (no long or short thesis)" };
  }
  const d = direction === "LONG" ? current.long : current.short;
  if (!d) {
    const side = direction === "LONG" ? "below" : "above";
    return { ...empty, status: "unavailable", direction, message: `Position levels unavailable (no weekly swing ${side} the daily trigger in the data)` };
  }
  return {
    ...empty,
    status: "ok",
    direction,
    entryTrigger: d.trigger,
    triggerSource: d.triggerSource,
    entryZoneLow: d.entryZoneLow,
    entryZoneHigh: d.entryZoneHigh,
    entryStatus: d.entryStatus,
    entryNote: d.entryNote,
    stop: d.stop,
    stopLevel: d.stopLevel,
    stopSource: d.stopSource,
    tp1: d.tp1,
    tp2: d.tp2,
    tp3: d.tp3,
    tp1R: d.tp1R,
    targets: d.targets,
    obstacles: d.obstacles ?? [],
    riskPerUnit: d.riskPerUnit,
    riskPct: d.riskPct,
    stopAtr: d.stopAtr,
    belowMinR: d.belowMinR,
    targetTooClose: d.targetTooClose,
    tightStop: d.tightStop,
  };
}

/** Short warning flags for a view, e.g. ["below 1.5R"]. */
export function positionFlags(v: PositionLevelView): string[] {
  if (v.status !== "ok") return [];
  const out: string[] = [];
  if (v.belowMinR) out.push(`below ${v.minRewardR}R`);
  if (v.targets[0]?.timeframe === "projection") out.push("TP1 is a projection (no weekly/monthly level beyond)");
  if (v.targetTooClose) out.push("TP1 may be only days away");
  if (v.tightStop) out.push("stop inside daily noise");
  if (v.entryStatus === "past_zone") out.push("past entry zone: don't chase");
  if (v.entryStatus === "beyond_stop") out.push("through the stop");
  return out;
}

/** Entry status as a short label. */
export function entryStatusLabel(s: EntryStatus | null): string {
  switch (s) {
    case "waiting": return "waiting for daily close";
    case "in_zone": return "in entry zone";
    case "past_zone": return "past entry zone";
    case "beyond_stop": return "through stop";
    default: return "—";
  }
}
