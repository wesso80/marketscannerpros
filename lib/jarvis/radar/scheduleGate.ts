/**
 * Gate for `npm run jarvis:scan -- --scheduled`.
 *
 * Render runs two UTC crons (21:15 and 22:15, weekdays). During EDT both fall
 * inside 16:45–18:30 America/New_York. The first writes run_marker status
 * "started" before the scan. A marker that is only "started" must not block
 * the later cron: a dead first process would otherwise leave no jarvis_runs row.
 * A completed marker, or a legacy marker with only `at`, still means already ran.
 */

export const JARVIS_WINDOW_START = 16 * 60 + 45;
export const JARVIS_WINDOW_END = 18 * 60 + 30;

export type JarvisClock = { date: string; minutes: number; weekday: string };
export type JarvisMarker = { at?: string; status?: string } | null;

export type JarvisScheduleDecision =
  | { run: false; reason: 'weekend' | 'outside-window' | 'already-ran' }
  | { run: true; reason: 'due' | 'retry-incomplete' };

export function nyClock(nowMs: number): JarvisClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(nowMs));
  const g = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')),
    weekday: g('weekday'),
  };
}

export function scheduledRunDecision(ny: Pick<JarvisClock, 'weekday' | 'minutes'>, marker: JarvisMarker): JarvisScheduleDecision {
  if (ny.weekday === 'Sat' || ny.weekday === 'Sun') return { run: false, reason: 'weekend' };
  if (ny.minutes < JARVIS_WINDOW_START || ny.minutes > JARVIS_WINDOW_END) return { run: false, reason: 'outside-window' };
  if (!marker) return { run: true, reason: 'due' };
  if (marker.status === 'started') return { run: true, reason: 'retry-incomplete' };
  return { run: false, reason: 'already-ran' };
}
