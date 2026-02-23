/**
 * Session Classifier & Anchor Logic
 *
 * Classifies a UTC timestamp into the US equity session window
 * and computes the appropriate event-study anchor bar.
 *
 * Rules (from spec):
 *  PREMARKET   04:00–09:30 ET  → anchor at 09:30 regular open
 *  REGULAR     09:30–16:00 ET  → anchor at nearest bar at/after event
 *  AFTERHOURS  16:00–20:00 ET  → anchor at next day 09:30 open
 *  OVERNIGHT   20:00–04:00 ET  → anchor at next regular 09:30 open
 */

import {
  MarketSession,
  SessionPhaseLabel,
  type SessionClassification,
  type AnchorResult,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Convert a Date to Eastern Time components.
 * Uses Intl to handle DST correctly.
 */
export function toET(utc: Date): { hours: number; minutes: number; totalMinutes: number; etDate: Date } {
  const etString = utc.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  return { hours, minutes, totalMinutes: hours * 60 + minutes, etDate };
}

/**
 * Return ET date string YYYY-MM-DD for a given UTC Date.
 */
export function etDateString(utc: Date): string {
  return utc.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').map(s => s.padStart(2, '0')).join('-')
    // Reformat from MM-DD-YYYY to YYYY-MM-DD
    .replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$1-$2');
}

/**
 * Build an ET Date at a specific HH:MM on the given ET calendar date.
 * This constructs via the America/New_York timezone so DST is correct.
 */
export function etDateAtTime(etDateStr: string, hours: number, minutes: number): Date {
  const [y, m, d] = etDateStr.split('-').map(Number);
  // Start with EST assumption (UTC-5). DST (EDT) would be UTC-4.
  // We refine via toET() to handle DST correctly without relying on local TZ.
  const estGuess = new Date(Date.UTC(y, m - 1, d, hours + 5, minutes, 0, 0));
  const { totalMinutes: actualET } = toET(estGuess);
  const targetET = hours * 60 + minutes;
  const diffMin = actualET - targetET;
  if (diffMin === 0) return estGuess;
  return new Date(estGuess.getTime() + diffMin * 60_000);
}

/**
 * Advance an ET date string by N calendar days.
 */
export function addDays(etDateStr: string, days: number): string {
  const [y, m, d] = etDateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Check if a given ET date is a US weekday (Mon–Fri). */
export function isWeekday(etDateStr: string): boolean {
  const [y, m, d] = etDateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
}

/** Find the next weekday on or after the given ET date. */
export function nextWeekday(etDateStr: string): string {
  let current = etDateStr;
  while (!isWeekday(current)) {
    current = addDays(current, 1);
  }
  return current;
}

/** Find the next weekday strictly after the given ET date. */
export function nextWeekdayAfter(etDateStr: string): string {
  return nextWeekday(addDays(etDateStr, 1));
}

// ─── Session classification ─────────────────────────────────────────

const PREMARKET_START  = 4 * 60;          // 04:00 = 240
const REGULAR_START    = 9 * 60 + 30;     // 09:30 = 570
const REGULAR_END      = 16 * 60;         // 16:00 = 960
const AFTERHOURS_END   = 20 * 60;         // 20:00 = 1200

/**
 * Classify which session window a given minute-of-day (ET) falls in.
 */
function classifyMinute(totalMinutes: number): MarketSession {
  if (totalMinutes >= PREMARKET_START && totalMinutes < REGULAR_START) return MarketSession.PREMARKET;
  if (totalMinutes >= REGULAR_START && totalMinutes < REGULAR_END) return MarketSession.REGULAR;
  if (totalMinutes >= REGULAR_END && totalMinutes < AFTERHOURS_END) return MarketSession.AFTERHOURS;
  return MarketSession.OVERNIGHT;
}

/**
 * Classify sub-phase within a session.
 */
function classifyPhase(totalMinutes: number, session: MarketSession): SessionPhaseLabel {
  switch (session) {
    case MarketSession.PREMARKET:
      return totalMinutes < 7 * 60 ? SessionPhaseLabel.EARLY_PREMARKET : SessionPhaseLabel.LATE_PREMARKET;
    case MarketSession.REGULAR:
      if (totalMinutes < 10 * 60) return SessionPhaseLabel.OPENING_RANGE;
      if (totalMinutes < 11 * 60 + 30) return SessionPhaseLabel.MORNING_MOMENTUM;
      if (totalMinutes < 14 * 60) return SessionPhaseLabel.MIDDAY;
      if (totalMinutes < 15 * 60) return SessionPhaseLabel.AFTERNOON;
      if (totalMinutes < 15 * 60 + 45) return SessionPhaseLabel.POWER_HOUR;
      return SessionPhaseLabel.CLOSE;
    case MarketSession.AFTERHOURS:
      return totalMinutes < 18 * 60 ? SessionPhaseLabel.EARLY_AFTERHOURS : SessionPhaseLabel.LATE_AFTERHOURS;
    case MarketSession.OVERNIGHT:
      return SessionPhaseLabel.OVERNIGHT_GEN;
  }
}

/**
 * Classify a UTC timestamp into session + phase.
 */
export function classifySession(utcTimestamp: Date): SessionClassification {
  const { totalMinutes, etDate } = toET(utcTimestamp);
  const session = classifyMinute(totalMinutes);
  const phase = classifyPhase(totalMinutes, session);
  return { session, phase, inputTimestampET: etDate };
}

// ─── Anchor computation ─────────────────────────────────────────────

/**
 * Compute the event-study anchor bar for a given UTC event timestamp.
 *
 * Rules:
 *  PREMARKET   → anchor at same-day 09:30 ET open
 *  REGULAR     → anchor at event time (rounded to bar boundary externally)
 *  AFTERHOURS  → anchor at next business day 09:30 ET open
 *  OVERNIGHT   → anchor at next business day 09:30 ET open
 */
export function computeAnchor(utcTimestamp: Date): AnchorResult {
  const { totalMinutes, etDate } = toET(utcTimestamp);
  const session = classifyMinute(totalMinutes);
  const phase = classifyPhase(totalMinutes, session);
  const dateStr = etDateString(utcTimestamp);

  let anchorDateStr: string;
  let anchorTimestamp: Date;

  switch (session) {
    case MarketSession.PREMARKET:
      // Same day 09:30 open
      anchorDateStr = dateStr;
      anchorTimestamp = etDateAtTime(anchorDateStr, 9, 30);
      break;

    case MarketSession.REGULAR:
      // Anchor is the event time itself (caller rounds to nearest bar)
      anchorTimestamp = utcTimestamp;
      anchorDateStr = dateStr;
      break;

    case MarketSession.AFTERHOURS:
      // Next business day 09:30
      anchorDateStr = nextWeekdayAfter(dateStr);
      anchorTimestamp = etDateAtTime(anchorDateStr, 9, 30);
      break;

    case MarketSession.OVERNIGHT:
      // If before midnight (20:00–23:59), next biz day
      // If after midnight (00:00–03:59), same calendar day might be the next biz day
      if (totalMinutes >= 20 * 60) {
        // Evening overnight: next biz day
        anchorDateStr = nextWeekdayAfter(dateStr);
      } else {
        // Early morning overnight (00:00–03:59): same date's 09:30 if weekday, else next
        anchorDateStr = nextWeekday(dateStr);
      }
      anchorTimestamp = etDateAtTime(anchorDateStr, 9, 30);
      break;
  }

  const eventToAnchorMinutes = Math.round((anchorTimestamp.getTime() - utcTimestamp.getTime()) / 60_000);

  return {
    session,
    phase,
    eventTimestampET: etDate,
    anchorTimestampET: anchorTimestamp,
    eventToAnchorMinutes,
  };
}
