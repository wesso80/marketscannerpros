/**
 * Closed-market handling for saved admin scans (US equities).
 *
 * Outside the regular session (nights, weekends, holidays) the newest bar is the last session's, so its
 * wall-clock age grows for ~65 hours over a weekend. Judged by that age, every symbol turned STALE (data trust
 * 15, lifecycle DATA_DEGRADED) and every saved scan older than 2.5 h dropped out of Priority Desk ranking,
 * although nothing newer exists. While the market is shut, data from the last completed session is as current
 * as it can be: it is labelled "as of <session> close" instead of being thrown out as stale.
 */
import { computeDataTruth, type DataTruth } from "@/lib/engines/dataTruth";
import { nyWallTimeToUtcMs } from "@/lib/time/nyWallClock";
import {
  formatSessionDate,
  isUsRegularSessionOpen,
  lastCompletedUsSessionDate,
  nyDateTime,
  usSessionCloseMinutes,
} from "@/lib/time/usSession";

export interface ClosedUsSession {
  /** NY date of the last completed session, YYYY-MM-DD. */
  sessionDate: string;
  /** The session's close (16:00 ET, or the early close) as epoch ms. */
  closeMs: number;
  /** e.g. "as of Fri 25 Sep 2026 close". */
  label: string;
}

/** The last completed US session while the regular session is closed; null while it is open. */
export function closedUsSession(nowMs: number = Date.now()): ClosedUsSession | null {
  if (isUsRegularSessionOpen(nowMs)) return null;
  const sessionDate = lastCompletedUsSessionDate(nowMs);
  const mins = usSessionCloseMinutes(sessionDate);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  const closeMs = nyWallTimeToUtcMs(`${sessionDate} ${hh}:${mm}:00`);
  if (closeMs == null) return null;
  return { sessionDate, closeMs, label: `as of ${formatSessionDate(sessionDate)} close` };
}

/** NY calendar date of a bar timestamp (ISO instant, or "YYYY-MM-DD" for daily bars). */
function barNyDate(ts: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? nyDateTime(ms).ymd : null;
}

/** The closed session when the market is shut and the newest bar belongs to the last completed session. */
export function closedSessionForBar(lastBarTs: string | null | undefined, nowMs: number = Date.now()): ClosedUsSession | null {
  if (!lastBarTs) return null;
  const session = closedUsSession(nowMs);
  if (!session) return null;
  return barNyDate(lastBarTs) === session.sessionDate ? session : null;
}

/**
 * Data truth for last-session bars while the market is closed: CACHED (complete, not live), with the real age
 * kept and a note saying which session it is, instead of STALE by wall-clock age.
 */
export function closedMarketDataTruth(ageSec: number | null, timeframe: string, session: ClosedUsSession): DataTruth {
  const base = computeDataTruth({ marketDataAgeSec: 0, timeframe, isCached: true });
  return {
    ...base,
    ageSec: Math.max(0, Math.round(ageSec ?? 0)),
    notes: [`US market closed: last session's data (${session.label}).`],
  };
}

/** A saved scan built after the last session closed is still current while the market stays closed. */
export function isCurrentForClosedMarket(scannedAtIso: string | null, nowMs: number = Date.now()): boolean {
  if (!scannedAtIso) return false;
  const session = closedUsSession(nowMs);
  const scannedMs = Date.parse(scannedAtIso);
  return !!session && Number.isFinite(scannedMs) && scannedMs >= session.closeMs;
}
