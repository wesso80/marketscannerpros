export interface CalendarObservation {
  releaseTimeUtc?: string;
  timingConfirmed?: boolean;
  dataStatus?: string;
  releaseStatus?: string;
}

export function upcomingConfirmedEvents<T extends CalendarObservation>(events: T[], nowMs = Date.now()): T[] {
  return events.filter((event) => event.timingConfirmed === true && Number.isFinite(Date.parse(event.releaseTimeUtc || '')) && Date.parse(event.releaseTimeUtc!) > nowMs)
    .sort((a, b) => Date.parse(a.releaseTimeUtc!) - Date.parse(b.releaseTimeUtc!));
}

function isReleased(event: CalendarObservation, nowMs: number): boolean {
  if (event.releaseStatus) return event.releaseStatus === 'RELEASED' || event.releaseStatus === 'REVISED';
  const t = Date.parse(event.releaseTimeUtc || '');
  return Number.isFinite(t) && t <= nowMs;
}

export interface CalendarHealth {
  total: number;
  /** Release date/time not confirmed by an official schedule. */
  timingUnconfirmed: number;
  /** Released prints with no actual, or a stale provider snapshot (timing confirmed). */
  dataProblems: number;
  /** Upcoming releases with no consensus figure. Informational: not a feed problem. */
  noConsensus: number;
}

/**
 * Split calendar health into separate counts (OV-6). A missing consensus figure on an
 * upcoming release is not a timing problem (no consensus provider is configured), so it
 * no longer marks every event as "unconfirmed timing".
 */
export function calendarHealth(events: CalendarObservation[], nowMs = Date.now()): CalendarHealth {
  let timingUnconfirmed = 0;
  let dataProblems = 0;
  let noConsensus = 0;
  for (const event of events) {
    if (event.timingConfirmed !== true) {
      timingUnconfirmed++;
      continue;
    }
    const status = event.dataStatus || '';
    const released = isReleased(event, nowMs);
    if (status === 'STALE' || (status === 'MISSING' && released)) dataProblems++;
    else if (status === 'MISSING' && !released) noConsensus++;
  }
  return { total: events.length, timingUnconfirmed, dataProblems, noConsensus };
}

export function calendarDataWarning(events: CalendarObservation[] | undefined, nowMs = Date.now()): string | null {
  if (!events?.length) return 'Calendar coverage unavailable';
  const h = calendarHealth(events, nowMs);
  const parts = [
    h.timingUnconfirmed ? `${h.timingUnconfirmed}/${h.total} events have unconfirmed timing` : null,
    h.dataProblems ? `${h.dataProblems}/${h.total} events have a missing actual or a stale snapshot` : null,
  ].filter(Boolean);
  return parts.length ? `Calendar: ${parts.join('; ')}` : null;
}

const RAW_STATUS = /^(LIVE|DELAYED|STALE|MISSING|UNCONFIRMED)$/;

/** Plain label for a release row. Does not invent a time, consensus, or actual. */
export function releaseReadingLabel(event: { dataStatus?: string; statusDetail?: string; timingConfirmed?: boolean }): string {
  const detail = event.statusDetail?.trim();
  const plain = detail && !RAW_STATUS.test(detail) && !/\bMISSING\b/.test(detail) ? detail : null;
  if (event.timingConfirmed === false || event.dataStatus === 'UNCONFIRMED') {
    return plain ?? 'Release time not confirmed yet.';
  }
  if (event.dataStatus === 'MISSING') return plain ?? 'Consensus figure not available yet.';
  if (event.dataStatus === 'STALE') return 'Saved reading may be out of date.';
  if (event.dataStatus === 'DELAYED') return 'Released figure not available yet.';
  if (event.dataStatus === 'LIVE') return 'Released figure available.';
  return 'Data status not supplied.';
}

/** Public overview note. Separate from calendarDataWarning, which other surfaces still use. */
export function calendarTimingNote(events: CalendarObservation[] | undefined, nowMs = Date.now()): string | null {
  if (!events?.length) return null;
  const h = calendarHealth(events, nowMs);
  const counted = (count: number, noun: string, rest: string) => `${count} of ${h.total} ${noun} ${count === 1 ? 'is' : 'are'} ${rest}`;
  const parts = [
    h.timingUnconfirmed ? counted(h.timingUnconfirmed, 'release times', 'not confirmed yet') : null,
    h.dataProblems ? counted(h.dataProblems, 'released readings', 'missing or out of date') : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join('. ')}.` : null;
}
