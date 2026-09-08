// Phase 5B — 5-minute confirmed-bar utility, RTH mask, and log-return builder
// for the native Lead/Lag input.
//
// Pine semantics (§5, §7, §8):
//   • request.security(..., "5", ..., lookahead_off) → only completed 5m bars.
//   • RTH = 09:30–16:00 America/New_York; cash-market series null outside RTH.
//   • Log return: math.log(close / close[1]) * 100  (`confirmed=false`)
//                 math.log(close[1] / close[2]) * 100 (`confirmed=true`)
//   • Cash-market yXXX = nqRTH (NQ target masked outside RTH for cash leaders).
//
// This module is pure. It never issues HTTP calls. It contains only ordering,
// dedup, timestamp math, and the RTH/log-return transforms. Tests inject bar
// arrays directly.

import type { LeadLagAssetKey } from '../engines/leadLag';
import type { LeadLagBar5m } from './providers/leadLagAssetProviders';

/* ── Confirmed 5m bar normalisation ────────────────────────────────────────── */

export interface Confirmed5mSeries {
  bars: LeadLagBar5m[];
  /** Bars trimmed: current forming bar removed, duplicates dropped, non-finite dropped. */
  droppedFormingBar: LeadLagBar5m | null;
  droppedDuplicateCount: number;
  droppedNonFiniteCount: number;
  /** Latest confirmed 5m timestamp (ISO). */
  latestConfirmedTs: string | null;
}

/**
 * Trim to CONFIRMED 5-minute bars only. Drops the currently forming bar (any
 * bar whose START timestamp is within 5 minutes of `nowMs`). Duplicates by
 * timestamp are collapsed (last wins). Non-finite closes are dropped. Result
 * is ascending by timestamp.
 */
export function buildConfirmed5m(
  rawBars: LeadLagBar5m[] | null,
  nowMs: number = Date.now(),
): Confirmed5mSeries {
  if (!rawBars || rawBars.length === 0) {
    return {
      bars: [], droppedFormingBar: null,
      droppedDuplicateCount: 0, droppedNonFiniteCount: 0, latestConfirmedTs: null,
    };
  }
  const byTs = new Map<number, LeadLagBar5m>();
  let droppedNonFinite = 0;
  for (const b of rawBars) {
    if (!Number.isFinite(b.close) || b.close <= 0 || !Number.isFinite(b.tsMs)) {
      droppedNonFinite++;
      continue;
    }
    byTs.set(b.tsMs, b);
  }
  const droppedDup = rawBars.length - byTs.size - droppedNonFinite;
  const sorted = [...byTs.values()].sort((a, b) => a.tsMs - b.tsMs);

  // Drop the forming bar: any bar whose START ts is less than 5 minutes before nowMs.
  const cutoff = nowMs - 5 * 60 * 1000;
  let dropped: LeadLagBar5m | null = null;
  while (sorted.length > 0 && sorted[sorted.length - 1].tsMs > cutoff) {
    dropped = sorted.pop() ?? null;
  }

  return {
    bars: sorted,
    droppedFormingBar: dropped,
    droppedDuplicateCount: droppedDup,
    droppedNonFiniteCount: droppedNonFinite,
    latestConfirmedTs: sorted.length > 0 ? sorted[sorted.length - 1].ts : null,
  };
}

/* ── RTH mask ─────────────────────────────────────────────────────────────── */

export interface NyRthWindow {
  /** RTH start local time HH:MM (default 09:30). */
  startHHMM: string;
  /** RTH end local time HH:MM (default 16:00). */
  endHHMM: string;
  /** IANA timezone (default America/New_York). */
  tz: string;
}

export const NY_RTH: NyRthWindow = { startHHMM: '09:30', endHHMM: '16:00', tz: 'America/New_York' };

/**
 * True when `tsMs` falls within the NY RTH window on the local NY calendar
 * date. Uses `Intl.DateTimeFormat` with the `America/New_York` timezone so
 * DST transitions are handled correctly without hard-coded UTC offsets.
 */
export function isInNyRth(tsMs: number, win: NyRthWindow = NY_RTH): boolean {
  if (!Number.isFinite(tsMs)) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: win.tz,
    hour12: false,
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date(tsMs));
  const partMap = new Map(parts.map((p) => [p.type, p.value]));
  const hour = partMap.get('hour');
  const minute = partMap.get('minute');
  const weekday = partMap.get('weekday');
  if (hour == null || minute == null || weekday == null) return false;
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const clock = `${hour === '24' ? '00' : hour}:${minute}`;
  // Bar START must be strictly BEFORE 16:00 to be RTH — the 15:55 bar is the
  // last cash-market bar of the session.
  return clock >= win.startHHMM && clock < win.endHHMM;
}

/* ── Log-return series ────────────────────────────────────────────────────── */

export interface AssetReturnSeries {
  ts: string[];
  tsMs: number[];
  /** Log return * 100 aligned to bar t (using close[t]/close[t-1]). */
  x: (number | null)[];
  /** Session weight for the current bar (0 or 1). */
  active: number;
  latestTs: string | null;
  /** True when the leader is a cash-market (RTH-only) instrument. */
  rthOnly: boolean;
  /** Confirmed-bar diagnostics from the underlying normalisation. */
  diagnostics: Confirmed5mSeries;
}

export interface LogReturnOptions {
  /** Pine `confirmed=false` (default) → close/close[1]; `true` → close[1]/close[2]. */
  confirmed?: boolean;
  /** Fixes the current bar for RTH gating (default: last confirmed bar). */
  nowMs?: number;
  /** Override RTH window / timezone (defaults to NY 09:30–16:00). */
  rthWindow?: NyRthWindow;
}

/**
 * Build a log-return series from confirmed 5m bars.
 *
 * - `x[t]` = log(close[t] / close[t-1]) * 100 (Pine default). The first bar's
 *   return is null. When `confirmed=true`, x[t] = log(close[t-1]/close[t-2]).
 * - When `rthOnly` is true, x[t] is nulled outside the NY RTH window (Pine
 *   `xXXX := inRTH ? rXXX : na`).
 * - `active` is the CURRENT-BAR session weight — 0 if rthOnly AND the current
 *   bar sits outside RTH, else 1 (Pine `aXXX = inRTH ? 1 : 0` for cash).
 */
export function buildAssetReturnSeries(
  bars: LeadLagBar5m[],
  rthOnly: boolean,
  opts: LogReturnOptions = {},
): AssetReturnSeries {
  const confirmed = opts.confirmed === true;
  const rthWindow = opts.rthWindow ?? NY_RTH;
  const n = bars.length;
  const ts: string[] = new Array(n);
  const tsMs: number[] = new Array(n);
  const x: (number | null)[] = new Array(n).fill(null);
  const closes: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    ts[i] = bars[i].ts;
    tsMs[i] = bars[i].tsMs;
    closes[i] = bars[i].close;
  }

  // Raw log return series.
  const raw: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const c = closes[i];
    const p = closes[i - 1];
    if (!Number.isFinite(c) || !Number.isFinite(p) || c <= 0 || p <= 0) continue;
    raw[i] = Math.log(c / p) * 100;
  }

  // Apply confirmed shift (Pine confirmed=true → return[t] = raw[t-1]).
  if (confirmed) {
    for (let i = 1; i < n; i++) x[i] = i - 1 >= 0 ? raw[i - 1] : null;
  } else {
    for (let i = 0; i < n; i++) x[i] = raw[i];
  }

  // Apply RTH mask for cash-market leaders (Pine xXXX = inRTH ? rXXX : na).
  if (rthOnly) {
    for (let i = 0; i < n; i++) {
      if (!isInNyRth(tsMs[i], rthWindow)) x[i] = null;
    }
  }

  // Current-bar active weight: RTH-only leaders are inactive outside RTH.
  const nowMs = opts.nowMs ?? (n > 0 ? tsMs[n - 1] : Date.now());
  const active = rthOnly ? (isInNyRth(nowMs, rthWindow) ? 1 : 0) : 1;

  return {
    ts, tsMs, x, active,
    latestTs: n > 0 ? ts[n - 1] : null,
    rthOnly,
    diagnostics: {
      bars, droppedFormingBar: null, droppedDuplicateCount: 0, droppedNonFiniteCount: 0,
      latestConfirmedTs: n > 0 ? ts[n - 1] : null,
    },
  };
}

/* ── Target y series (Pine yXXX) ──────────────────────────────────────────── */

/**
 * Build the per-asset TARGET series `y` used inside `computePack(x, y, …)`.
 * Pine:
 *   yXXX = rthOnly(leader) ? nqRTH : nqRet
 *
 * where `nqRet` is the target's raw log return and `nqRTH` is that same
 * series masked outside RTH. Both use the same base target timestamps.
 */
export function buildTargetSeriesForAsset(
  nqReturn: (number | null)[],
  nqTsMs: number[],
  leaderRthOnly: boolean,
  opts: LogReturnOptions = {},
): (number | null)[] {
  if (!leaderRthOnly) return nqReturn;
  const rthWindow = opts.rthWindow ?? NY_RTH;
  const masked = new Array<number | null>(nqReturn.length);
  for (let i = 0; i < nqReturn.length; i++) {
    masked[i] = isInNyRth(nqTsMs[i], rthWindow) ? nqReturn[i] : null;
  }
  return masked;
}

/* ── Timestamp alignment ──────────────────────────────────────────────────── */

/**
 * Right-align a leader series onto the target's timestamp grid. For each
 * target bar t, we pick the leader bar with the SAME `tsMs`. Missing pairs
 * become nulls (matches Pine's request.security gaps_off semantics).
 */
export function alignLeaderToTargetGrid(
  targetTsMs: number[],
  leader: AssetReturnSeries,
): { x: (number | null)[]; alignedLatestTs: string | null } {
  const byTs = new Map<number, number | null>();
  for (let i = 0; i < leader.tsMs.length; i++) byTs.set(leader.tsMs[i], leader.x[i]);
  const out = new Array<number | null>(targetTsMs.length).fill(null);
  let latestNonNullIdx = -1;
  for (let i = 0; i < targetTsMs.length; i++) {
    const v = byTs.get(targetTsMs[i]);
    if (v != null && Number.isFinite(v)) { out[i] = v; latestNonNullIdx = i; }
  }
  return {
    x: out,
    alignedLatestTs: latestNonNullIdx >= 0
      ? new Date(targetTsMs[latestNonNullIdx]).toISOString().slice(0, 19) + 'Z'
      : null,
  };
}

/* ── Symbol/timeframe guard (Pine engineOK) ────────────────────────────────── */

/**
 * Pine `engineOK = symbolOK AND tfOK`, where symbolOK is the target ticker
 * containing "NQ" and tfOK is the 5-minute timeframe. This is a caller
 * responsibility; exposed here for reuse by the service module.
 */
export function isEngineOK(targetSymbol: string, timeframe: string): boolean {
  return targetSymbol.toUpperCase().includes('NQ') && timeframe.trim() === '5m';
}

/* ── Diagnostic — per-asset bar cadence gap detection ─────────────────────── */

export interface CadenceReport {
  totalBars: number;
  expectedSpacingMs: number;
  gapCount: number;
  maxGapMs: number;
  duplicateCount: number;
}

export function analyseCadence(
  bars: LeadLagBar5m[],
  expectedSpacingMs: number = 5 * 60 * 1000,
): CadenceReport {
  let gaps = 0, maxGap = 0, dupes = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].tsMs - bars[i - 1].tsMs;
    if (d === 0) dupes++;
    else if (d > expectedSpacingMs) { gaps++; maxGap = Math.max(maxGap, d); }
  }
  return { totalBars: bars.length, expectedSpacingMs, gapCount: gaps, maxGapMs: maxGap, duplicateCount: dupes };
}

/* ── Symbol / provider check (Phase 5B §3 reporting) ──────────────────────── */

/**
 * Suffix-free key for a leader that a diagnostic report can use to describe
 * which subset of leaders is currently reachable.
 */
export function describeLeaderStatus(
  key: LeadLagAssetKey,
  bars: LeadLagBar5m[] | null,
  rthOnly: boolean,
): { key: LeadLagAssetKey; barCount: number; latestTs: string | null; rthOnly: boolean; usable: boolean } {
  const usable = bars != null && bars.length >= 400;
  return {
    key,
    barCount: bars?.length ?? 0,
    latestTs: bars && bars.length > 0 ? bars[bars.length - 1].ts : null,
    rthOnly,
    usable,
  };
}
