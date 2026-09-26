/**
 * New York wall-clock → UTC instant.
 *
 * Alpha Vantage stamps US equity intraday bars (and daily session closes) in America/New_York local time with no
 * offset, e.g. "2026-09-25 15:00:00". Parsing that with `Date.parse(... + 'Z')` or `new Date(...)` on a UTC server
 * shifts every bar by 4–5 hours. This converts the wall-clock text to the real instant, DST-aware. Pure: no I/O.
 */

const NY_TZ = 'America/New_York';

const nyParts = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** NY wall clock minus UTC, in ms, at the given instant (e.g. -4h in EDT, -5h in EST). */
function nyOffsetMs(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of nyParts.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert "YYYY-MM-DD", "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" (also with a "T" separator) in New York local
 * time to epoch ms. Returns null for anything else.
 */
export function nyWallTimeToUtcMs(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  if (!Number.isFinite(wall)) return null;
  // Two passes so instants next to a DST switch pick up the offset in force at the target time.
  let utc = wall - nyOffsetMs(wall);
  utc = wall - nyOffsetMs(utc);
  return utc;
}
