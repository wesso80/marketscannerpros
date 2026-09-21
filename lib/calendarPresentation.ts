export interface CalendarObservation {
  releaseTimeUtc?: string;
  timingConfirmed?: boolean;
  dataStatus?: string;
}

export function upcomingConfirmedEvents<T extends CalendarObservation>(events: T[], nowMs = Date.now()): T[] {
  return events.filter((event) => event.timingConfirmed === true && Number.isFinite(Date.parse(event.releaseTimeUtc || '')) && Date.parse(event.releaseTimeUtc!) > nowMs)
    .sort((a, b) => Date.parse(a.releaseTimeUtc!) - Date.parse(b.releaseTimeUtc!));
}

export function calendarDataWarning(events: CalendarObservation[] | undefined): string | null {
  if (!events?.length) return 'Calendar coverage unavailable';
  const unverified = events.filter((event) => event.timingConfirmed !== true || !['LIVE', 'DELAYED'].includes(event.dataStatus || '')).length;
  return unverified ? `Calendar: ${unverified}/${events.length} events have unconfirmed timing or unavailable/stale data` : null;
}
