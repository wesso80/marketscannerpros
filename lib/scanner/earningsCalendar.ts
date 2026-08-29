/* ---------------------------------------------------------------------------
   Upcoming-earnings calendar map for the scanner.

   Fetches Alpha Vantage's EARNINGS_CALENDAR (the whole 3-month calendar) in a
   SINGLE call and caches it for an hour, so the scanner can cheaply look up
   "days until next earnings" for every equity it scores without a per-symbol
   request. Best-effort: any failure returns an empty map and the scanner simply
   proceeds without catalyst awareness.
   --------------------------------------------------------------------------- */

import { avTakeToken } from '@/lib/avRateGovernor';

const TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: { map: Map<string, string>; ts: number } | null = null;
let inflight: Promise<Map<string, string>> | null = null;

/** Returns a map of UPPERCASE symbol → earliest upcoming report date (YYYY-MM-DD). */
export async function getUpcomingEarningsMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.map;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (!apiKey) return new Map<string, string>();
      await avTakeToken();
      const res = await fetch(
        `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${apiKey}`,
      );
      if (!res.ok) return cache?.map ?? new Map<string, string>();
      const csv = await res.text();
      const map = parseEarningsCalendarCsv(csv);
      cache = { map, ts: Date.now() };
      return map;
    } catch {
      return cache?.map ?? new Map<string, string>();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Return the currently-cached map immediately (empty if nothing cached yet).
 *  Never blocks — safe to call inside the hot scan path. */
export function peekEarningsMap(): Map<string, string> {
  return cache?.map ?? new Map<string, string>();
}

/** Fire-and-forget: if the cache is missing or stale (and no fetch is already
 *  running), kick off a refresh in the background. Never awaited by callers. */
export function warmEarningsMap(): void {
  const now = Date.now();
  if (inflight) return;
  if (cache && now - cache.ts < TTL_MS) return;
  void getUpcomingEarningsMap();
}

/** Parse the AV EARNINGS_CALENDAR CSV into symbol → earliest report date. */
export function parseEarningsCalendarCsv(csv: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return map;
  const headers = lines[0].split(',').map((h) => h.trim());
  const symIdx = headers.indexOf('symbol');
  const dateIdx = headers.indexOf('reportDate');
  if (symIdx === -1 || dateIdx === -1) return map;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const symbol = values[symIdx]?.trim().toUpperCase();
    const reportDate = values[dateIdx]?.trim();
    if (!symbol || !reportDate) continue;
    const existing = map.get(symbol);
    // Keep the earliest upcoming date per symbol.
    if (!existing || reportDate < existing) map.set(symbol, reportDate);
  }
  return map;
}

/** Whole days from `from` until `dateStr` (YYYY-MM-DD). Null if invalid or past. */
export function daysUntilEarnings(dateStr: string | undefined, from: Date = new Date()): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const days = Math.round((target.getTime() - base.getTime()) / 86_400_000);
  return days < 0 ? null : days;
}
