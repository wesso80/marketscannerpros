/**
 * Viewer-zone rendering for economic calendar events (OV-4).
 *
 * The calendar API's legacy `date` / `time` fields are New York (ET) wall-clock
 * values, and several panels showed them bare, so an Australian reader saw
 * "08:30" for a release that is 22:30 their time. Every release also carries
 * `releaseTimeUtc`; this renders it in the viewer's own zone with the zone
 * abbreviation, the same default the Economic Calendar Intelligence tab uses
 * ("shown in your zone"). If an event has no usable UTC time, the ET fields are
 * shown with an explicit "ET" label instead of a bare clock.
 */
import { ET_ZONE, zonedClock, zonedDateKey } from './macro/calendar/time';

export interface EventTimeSource {
  releaseTimeUtc?: string | null;
  /** Legacy ET calendar date, YYYY-MM-DD. */
  date?: string | null;
  /** Legacy ET wall-clock, HH:mm. */
  time?: string | null;
}

export interface EventTimeDisplay {
  /** YYYY-MM-DD in the displayed zone ('' when unknown). */
  date: string;
  /** "22:30 AEST" or "08:30 ET" ('' when unknown). */
  time: string;
  /** Date and time together, e.g. "2026-09-30 22:30 AEST"; "Scheduled" when neither is known. */
  label: string;
  /** Zone abbreviation shown ("AEST", "EDT", "GMT+8", or "ET" for the fallback). */
  zone: string;
  /** Hover text with the same instant in ET and UTC. */
  title: string;
}

/** The browser's IANA zone; UTC if it can't be resolved. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Short zone name for an instant. ICU only has letter abbreviations for some
 * zones in some locales (Sydney is "AEST" in en-AU but "GMT+10" in en-US), so
 * try a few English locales and fall back to the GMT offset form.
 */
export function zoneAbbreviation(utcMs: number, timeZone: string): string {
  let fallback = '';
  for (const locale of ['en-US', 'en-AU', 'en-GB']) {
    try {
      const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
        .formatToParts(new Date(utcMs))
        .find((part) => part.type === 'timeZoneName')?.value;
      if (!name) continue;
      if (!/^GMT[+-−]/.test(name) && !/^UTC[+-−]/.test(name)) return name;
      fallback ||= name;
    } catch {
      // Unknown zone in this runtime; try the next locale.
    }
  }
  return fallback || timeZone;
}

export function formatEventTime(event: EventTimeSource, timeZone: string = viewerTimeZone()): EventTimeDisplay {
  const ms = Date.parse(event.releaseTimeUtc ?? '');
  if (Number.isFinite(ms)) {
    try {
      const date = zonedDateKey(ms, timeZone);
      const zone = zoneAbbreviation(ms, timeZone);
      const time = `${zonedClock(ms, timeZone)} ${zone}`;
      const et = `${zonedDateKey(ms, ET_ZONE)} ${zonedClock(ms, ET_ZONE)} ET`;
      return { date, time, label: `${date} ${time}`, zone, title: `${et} · ${new Date(ms).toISOString().replace('.000Z', 'Z')} UTC` };
    } catch {
      // Invalid zone: fall through to the labelled ET fields.
    }
  }
  const date = event.date?.trim() ?? '';
  const time = event.time?.trim() ? `${event.time.trim()} ET` : '';
  const label = [date, time].filter(Boolean).join(' ') || 'Scheduled';
  return { date, time, label, zone: 'ET', title: label === 'Scheduled' ? 'Release time not published' : `${label} (New York time)` };
}
