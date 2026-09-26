/**
 * Age of market data measured from the newest bar's CLOSE, not its open.
 *
 * Alpha Vantage intraday timestamps (and our parsed ISO instants) are bar START times, so a 15m bar that has just
 * closed used to read as 900 s old, above the 450 s LIVE threshold for 15m: every 15m symbol showed DELAYED at
 * best, even with the freshest possible data.
 *
 * - Intraday bar: close = open + timeframe. For US equities it is capped at that session's close (a 1h bar opening
 *   at 15:30 ET closes at 16:00).
 * - Daily bar ("YYYY-MM-DD"): US equities close at that session's close (16:00 ET, or the early close); other
 *   markets at the next 00:00 UTC.
 * - A bar whose close is still in the future is FORMING (incomplete). It is not counted as fresh data: the age is
 *   measured from the newest completed bar's close, which is the forming bar's open.
 */
import { timeframeToSeconds } from "@/lib/engines/dataTruth";
import { nyWallTimeToUtcMs } from "@/lib/time/nyWallClock";
import { nyDateTime, usSessionCloseMinutes } from "@/lib/time/usSession";

export interface BarAge {
  /** Seconds since the newest completed bar closed (>= 0), or null when unknown. */
  ageSec: number | null;
  /** Close of the newest bar (epoch ms), or null when it can't be parsed. */
  closeMs: number | null;
  /** The newest bar is still forming (its close is in the future). */
  forming: boolean;
}

function sessionCloseMs(ymd: string): number | null {
  const mins = usSessionCloseMinutes(ymd);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return nyWallTimeToUtcMs(`${ymd} ${hh}:${mm}:00`);
}

/** Open and close (epoch ms) of a bar from its timestamp and timeframe. */
export function barWindowMs(timestamp: string, timeframe: string, market?: string): { openMs: number; closeMs: number } | null {
  const equities = String(market ?? "").toUpperCase() === "EQUITIES";
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    const openMs = Date.parse(`${timestamp}T00:00:00Z`);
    if (!Number.isFinite(openMs)) return null;
    const closeMs = equities ? sessionCloseMs(timestamp) ?? openMs + 86_400_000 : openMs + 86_400_000;
    return { openMs, closeMs };
  }
  const openMs = Date.parse(timestamp);
  if (!Number.isFinite(openMs)) return null;
  const tfSec = timeframeToSeconds(timeframe) ?? 0;
  let closeMs = openMs + tfSec * 1000;
  if (equities && tfSec > 0 && tfSec < 86_400) {
    const sessionClose = sessionCloseMs(nyDateTime(openMs).ymd);
    if (sessionClose != null && openMs < sessionClose && closeMs > sessionClose) closeMs = sessionClose;
  }
  return { openMs, closeMs };
}

/** Age of the newest bar's data, measured from its close (see module doc). */
export function barAgeFromClose(timestamp: string | null | undefined, timeframe: string, market?: string, nowMs: number = Date.now()): BarAge {
  if (!timestamp) return { ageSec: null, closeMs: null, forming: false };
  const w = barWindowMs(timestamp, timeframe, market);
  if (!w) return { ageSec: null, closeMs: null, forming: false };
  const forming = w.closeMs > nowMs;
  // Forming: the newest COMPLETE data is the previous bar, which closed when this one opened.
  const ref = forming ? w.openMs : w.closeMs;
  return { ageSec: Math.max(0, Math.round((nowMs - ref) / 1000)), closeMs: w.closeMs, forming };
}

/** "forming bar (closes 16:00 ET)" note text. */
export function formingBarNote(closeMs: number): string {
  const { minutes } = nyDateTime(closeMs);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `Forming bar: the newest bar is still open (closes ${hh}:${mm} ET); age is measured from the last completed bar.`;
}
