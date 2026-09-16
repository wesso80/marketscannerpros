/**
 * Timezone helpers for the global macro calendar.
 *
 * Rules:
 *  - UTC is the only internal representation (epoch ms / ISO with Z).
 *  - Local wall-clock strings are derived views, computed through Intl so DST
 *    transitions are handled by the platform tz database, not hand-coded offsets.
 */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock components of a UTC instant in the given zone. */
export function getZonedParts(utcMs: number, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = parseInt(part.value, 10);
  }
  // Intl may emit hour 24 for midnight under some engines; normalize.
  const hour = map.hour === 24 ? 0 : map.hour;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute, second: map.second };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. Positive east of UTC. */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const p = getZonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a local wall-clock time in `timeZone` to a UTC Date.
 * Two-pass offset resolution handles DST boundaries.
 */
export function zonedTimeToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map((v) => parseInt(v, 10));
  const [hh, mm] = localTime.split(':').map((v) => parseInt(v, 10));
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid local date/time: ${localDate} ${localTime}`);
  }
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset1 = tzOffsetMs(wallAsUtc, timeZone);
  let result = wallAsUtc - offset1;
  const offset2 = tzOffsetMs(result, timeZone);
  if (offset2 !== offset1) result = wallAsUtc - offset2;
  return new Date(result);
}

/** True when the zone is currently observing daylight saving at this instant. */
export function isDaylightSaving(utcMs: number, timeZone: string): boolean {
  const year = getZonedParts(utcMs, timeZone).year;
  const jan = tzOffsetMs(Date.UTC(year, 0, 1, 12), timeZone);
  const jul = tzOffsetMs(Date.UTC(year, 6, 1, 12), timeZone);
  const standard = Math.min(jan, jul);
  if (jan === jul) return false;
  return tzOffsetMs(utcMs, timeZone) > standard;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD of the instant in the given zone. */
export function zonedDateKey(utcMs: number, timeZone: string): string {
  const p = getZonedParts(utcMs, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** HH:mm (24h) of the instant in the given zone. */
export function zonedClock(utcMs: number, timeZone: string): string {
  const p = getZonedParts(utcMs, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "08:30 JST" / "07:00 BST" using the supplied abbreviations. */
export function formatLocalRelease(
  utcMs: number,
  timeZone: string,
  abbr: { standard: string; daylight: string },
): string {
  const label = isDaylightSaving(utcMs, timeZone) ? abbr.daylight : abbr.standard;
  return `${zonedClock(utcMs, timeZone)} ${label}`;
}

/** Viewer-zone rendering, e.g. "Thu 25 Sep, 09:30". */
export function formatUserTime(utcMs: number, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(utcMs));
}

/** Countdown label from now to target. Negative deltas clamp to 0. */
export function formatCountdown(targetUtcMs: number, nowUtcMs: number): string {
  const totalMinutes = Math.max(0, Math.floor((targetUtcMs - nowUtcMs) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const ET_ZONE = 'America/New_York';
