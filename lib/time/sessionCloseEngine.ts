/**
 * TradingView-Accurate Equity Session Close Engine
 *
 * Computes anchor-based intraday candle closes for US equities matching
 * TradingView's behaviour based on session mode:
 *
 *   regular  = 09:30 → 16:00 ET  (RTH only)
 *   extended = 04:00 → 20:00 ET  (pre-market + post-market)
 *   full     = 00:00 → 24:00 ET  (rare; useful for testing)
 *
 * Key confluences (extended anchor = 04:00 ET):
 *   4h closes: 08:00, 12:00, 16:00, 20:00
 *   2h closes: 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00
 *   1h closes: every hour from 05:00
 *
 * Key confluences (regular anchor = 09:30 ET):
 *   4h closes: 13:30, (then 16:00 daily)
 *   2h closes: 11:30, 13:30, 15:30, (then 16:00 daily)
 *   1h closes: 10:30, 11:30, 12:30, 13:30, 14:30, 15:30, (then 16:00 daily)
 */

import { isUSMarketHoliday } from './marketHolidays';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionMode = 'regular' | 'extended' | 'full';

interface SessionTemplate {
  /** IANA timezone for the exchange */
  tz: string;
  /** Candle anchor point (hour) — candle boundaries are multiples of TF from here */
  anchorHH: number;
  anchorMM: number;
  /** Trading session open */
  sessionOpenHH: number;
  sessionOpenMM: number;
  /** Trading session close */
  sessionCloseHH: number;
  sessionCloseMM: number;
}

// ─── Session Templates ──────────────────────────────────────────────────────

const US_EQUITY_SESSIONS: Record<SessionMode, SessionTemplate> = {
  regular: {
    tz: 'America/New_York',
    anchorHH: 9, anchorMM: 30,
    sessionOpenHH: 9, sessionOpenMM: 30,
    sessionCloseHH: 16, sessionCloseMM: 0,
  },
  extended: {
    tz: 'America/New_York',
    anchorHH: 4, anchorMM: 0,
    sessionOpenHH: 4, sessionOpenMM: 0,
    sessionCloseHH: 20, sessionCloseMM: 0,
  },
  full: {
    tz: 'America/New_York',
    anchorHH: 0, anchorMM: 0,
    sessionOpenHH: 0, sessionOpenMM: 0,
    sessionCloseHH: 24, sessionCloseMM: 0,
  },
};

// ─── Timezone Helpers ───────────────────────────────────────────────────────

function getZonedParts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? 0 : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dayOfWeek: weekdayMap[map.weekday] ?? date.getUTCDay(),
  };
}

/**
 * Compute UTC offset in minutes for a given timezone at a given instant.
 * Positive = east of UTC (e.g. +60 for CET), negative = west (e.g. -300 for EST).
 */
function getTzOffsetMinutes(date: Date, tz: string): number {
  const z = getZonedParts(date, tz);
  const asUtcMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return Math.round((asUtcMs - date.getTime()) / 60_000);
}

/**
 * Build a UTC Date for "today-in-tz at HH:MM:00".
 */
function zonedTimeToUtc(refDate: Date, tz: string, hh: number, mm: number): Date {
  const z = getZonedParts(refDate, tz);
  // Build a "naive" UTC date using the zoned Y/M/D + target HH:MM
  const naiveUtc = new Date(Date.UTC(z.year, z.month - 1, z.day, hh, mm, 0));
  // Adjust by the local offset to get the true UTC instant
  const offsetMins = getTzOffsetMinutes(refDate, tz);
  return new Date(naiveUtc.getTime() - offsetMins * 60_000);
}

// ─── Core Engine ────────────────────────────────────────────────────────────

/**
 * Given a `now` instant and an anchor time, compute the next candle close
 * for a given TF period (in minutes).
 *
 * Candle boundaries = anchor + N × tfMinutes.
 * Returns the first boundary strictly after `now`.
 */
function computeNextCloseFromAnchor(now: Date, anchor: Date, tfMinutes: number) {
  const diffMs = now.getTime() - anchor.getTime();
  const minsSinceAnchor = diffMs / 60_000;

  // Next multiple of tfMinutes from anchor that is > now
  // Use ceil, but if we're exactly on a boundary, go to the next one
  const periods = Math.ceil(minsSinceAnchor / tfMinutes);
  const nextPeriod = minsSinceAnchor > 0 && minsSinceAnchor % tfMinutes === 0
    ? periods + 1
    : Math.max(1, periods);

  const nextCloseMs = anchor.getTime() + nextPeriod * tfMinutes * 60_000;
  const minsToClose = Math.max(0, Math.ceil((nextCloseMs - now.getTime()) / 60_000));

  return { nextCloseAt: new Date(nextCloseMs), minsToClose };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface IntradayCloseResult {
  nextCloseAt: Date;
  minsToClose: number;
}

/**
 * Compute the next intraday candle close for a US equity, anchored to the
 * session open time in exchange TZ.
 *
 * For `regular` mode (anchor 09:30 ET):
 *   1h → 10:30, 11:30, 12:30, 13:30, 14:30, 15:30, then 16:00 (session end)
 *
 * For `extended` mode (anchor 04:00 ET):
 *   4h → 08:00, 12:00, 16:00, 20:00
 *   1h → 05:00, 06:00, 07:00 … 19:00, then 20:00 (session end)
 *
 * When `now` is outside the session window (weekends, holidays, overnight),
 * the engine computes the first close of the next session.
 */
export function getNextCloseIntraday(opts: {
  now: Date;
  tfMinutes: number;
  sessionMode: SessionMode;
  exchangeTz?: string;
}): IntradayCloseResult {
  const { now, tfMinutes, sessionMode, exchangeTz } = opts;
  const template = US_EQUITY_SESSIONS[sessionMode];
  const tz = exchangeTz || template.tz;

  const z = getZonedParts(now, tz);

  // ── Build today's anchor / session open / session close in UTC ──
  const anchorToday = zonedTimeToUtc(now, tz, template.anchorHH, template.anchorMM);
  const sessionOpenToday = zonedTimeToUtc(now, tz, template.sessionOpenHH, template.sessionOpenMM);
  const sessionCloseHH = template.sessionCloseHH === 24 ? 23 : template.sessionCloseHH;
  const sessionCloseMM = template.sessionCloseHH === 24 ? 59 : template.sessionCloseMM;
  const sessionCloseToday = template.sessionCloseHH === 24
    ? new Date(zonedTimeToUtc(now, tz, 23, 59).getTime() + 60_000) // midnight
    : zonedTimeToUtc(now, tz, sessionCloseHH, sessionCloseMM);

  const nowMs = now.getTime();
  const isWeekday = z.dayOfWeek >= 1 && z.dayOfWeek <= 5;
  // z.month is 1-indexed from Intl.DateTimeFormat; isUSMarketHoliday expects 0-indexed
  const isHoliday = isWeekday && isUSMarketHoliday(z.year, z.month - 1, z.day);

  // ── Check if we are inside today's session (and it's a trading day) ──
  if (isWeekday && !isHoliday && nowMs >= sessionOpenToday.getTime() && nowMs < sessionCloseToday.getTime()) {
    // Inside session — compute next close from anchor
    const result = computeNextCloseFromAnchor(now, anchorToday, tfMinutes);

    // If the computed close is at or past session close, clamp to session close
    if (result.nextCloseAt.getTime() >= sessionCloseToday.getTime()) {
      const minsToSessionClose = Math.max(0, Math.ceil((sessionCloseToday.getTime() - nowMs) / 60_000));
      return { nextCloseAt: sessionCloseToday, minsToClose: minsToSessionClose };
    }

    return result;
  }

  // ── Outside session or holiday: find the next trading day's first close ──
  let daysAhead = 0;

  if (isWeekday && !isHoliday && nowMs < sessionOpenToday.getTime()) {
    // Before session open on a trading day — first close is today
    daysAhead = 0;
  } else if (z.dayOfWeek === 5 && nowMs >= sessionCloseToday.getTime()) {
    daysAhead = 3; // Friday after close → Monday
  } else if (z.dayOfWeek === 6) {
    daysAhead = 2; // Saturday → Monday
  } else if (z.dayOfWeek === 0) {
    daysAhead = 1; // Sunday → Monday
  } else {
    // Weekday after close or holiday → tomorrow
    daysAhead = 1;
  }

  // Build next session's anchor, advancing past any holidays
  let nextDate = new Date(nowMs + daysAhead * 86_400_000);
  for (let _s = 0; _s < 10; _s++) {
    const nd = getZonedParts(nextDate, tz);
    if (nd.dayOfWeek === 6) { nextDate = new Date(nextDate.getTime() + 2 * 86_400_000); continue; }
    if (nd.dayOfWeek === 0) { nextDate = new Date(nextDate.getTime() + 86_400_000); continue; }
    if (isUSMarketHoliday(nd.year, nd.month - 1, nd.day)) { nextDate = new Date(nextDate.getTime() + 86_400_000); continue; }
    break;
  }
  const nextAnchor = zonedTimeToUtc(nextDate, tz, template.anchorHH, template.anchorMM);
  const nextSessionOpen = zonedTimeToUtc(nextDate, tz, template.sessionOpenHH, template.sessionOpenMM);

  // First close = anchor + ceil((sessionOpen - anchor) / tf) * tf
  // (For regular mode where anchor = sessionOpen, first close = anchor + tfMinutes)
  const result = computeNextCloseFromAnchor(nextSessionOpen, nextAnchor, tfMinutes);
  return result;
}

/**
 * Get the session open and close boundaries in UTC ms for the current or
 * next trading session, respecting the session mode.
 *
 * This replaces the old `getNextEquitySession()` (which was RTH-only).
 */
export function getSessionBounds(opts: {
  now: Date;
  sessionMode: SessionMode;
  exchangeTz?: string;
}): { openMs: number; closeMs: number; isInSession: boolean } {
  const { now, sessionMode, exchangeTz } = opts;
  const template = US_EQUITY_SESSIONS[sessionMode];
  const tz = exchangeTz || template.tz;
  const z = getZonedParts(now, tz);
  const nowMs = now.getTime();

  const sessionOpen = zonedTimeToUtc(now, tz, template.sessionOpenHH, template.sessionOpenMM);
  const sessionClose = template.sessionCloseHH === 24
    ? new Date(zonedTimeToUtc(now, tz, 23, 59).getTime() + 60_000)
    : zonedTimeToUtc(now, tz, template.sessionCloseHH, template.sessionCloseMM);

  const isWeekday = z.dayOfWeek >= 1 && z.dayOfWeek <= 5;
  const isInSession = isWeekday && nowMs >= sessionOpen.getTime() && nowMs < sessionClose.getTime();

  if (isInSession) {
    return { openMs: sessionOpen.getTime(), closeMs: sessionClose.getTime(), isInSession: true };
  }

  // Find next session
  let daysAhead = 0;
  if (isWeekday && nowMs < sessionOpen.getTime()) {
    daysAhead = 0;
  } else if (z.dayOfWeek === 5 && nowMs >= sessionClose.getTime()) {
    daysAhead = 3;
  } else if (z.dayOfWeek === 6) {
    daysAhead = 2;
  } else if (z.dayOfWeek === 0) {
    daysAhead = 1;
  } else {
    daysAhead = 1;
  }

  const nextDate = new Date(nowMs + daysAhead * 86_400_000);
  const nextOpen = zonedTimeToUtc(nextDate, tz, template.sessionOpenHH, template.sessionOpenMM);
  const nextClose = template.sessionCloseHH === 24
    ? new Date(zonedTimeToUtc(nextDate, tz, 23, 59).getTime() + 60_000)
    : zonedTimeToUtc(nextDate, tz, template.sessionCloseHH, template.sessionCloseMM);

  return { openMs: nextOpen.getTime(), closeMs: nextClose.getTime(), isInSession: false };
}

/**
 * Check whether the equity market is currently "open" for the given session mode.
 * - regular  → 09:30-16:00 ET weekdays
 * - extended → 04:00-20:00 ET weekdays
 * - full     → 00:00-24:00 ET weekdays
 */
export function isMarketOpenForSession(now: Date, sessionMode: SessionMode): boolean {
  const { isInSession } = getSessionBounds({ now, sessionMode });
  return isInSession;
}

/**
 * Get the session length in minutes for a given mode.
 */
export function getSessionLengthMins(sessionMode: SessionMode): number {
  const t = US_EQUITY_SESSIONS[sessionMode];
  return (t.sessionCloseHH * 60 + t.sessionCloseMM) - (t.sessionOpenHH * 60 + t.sessionOpenMM);
}
