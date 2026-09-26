import { describe, expect, it } from 'vitest';
import { calendarDataWarning, calendarHealth } from '@/lib/calendarPresentation';

const now = Date.parse('2026-09-26T00:00:00Z');
const upcoming = (confirmed: boolean, dataStatus: string) => ({
  releaseTimeUtc: '2026-09-30T12:30:00Z', timingConfirmed: confirmed, dataStatus, releaseStatus: 'UPCOMING',
});

describe('calendar health: timing vs consensus (OV-6)', () => {
  it('confirmed upcoming releases with no consensus are not counted as a timing problem', () => {
    const events = Array.from({ length: 6 }, () => upcoming(true, 'MISSING'));
    expect(calendarHealth(events, now)).toEqual({ total: 6, timingUnconfirmed: 0, dataProblems: 0, noConsensus: 6 });
    expect(calendarDataWarning(events, now)).toBeNull();
  });

  it('counts only unconfirmed timing as timing problems (was 28/28 when consensus was missing)', () => {
    const events = [
      ...Array.from({ length: 6 }, () => upcoming(true, 'MISSING')),
      ...Array.from({ length: 22 }, () => upcoming(false, 'UNCONFIRMED')),
    ];
    expect(calendarDataWarning(events, now)).toBe('Calendar: 22/28 events have unconfirmed timing');
  });

  it('released prints with no actual, and stale snapshots, are reported separately', () => {
    const events = [
      { releaseTimeUtc: '2026-09-25T12:30:00Z', timingConfirmed: true, dataStatus: 'MISSING', releaseStatus: 'RELEASED' },
      { releaseTimeUtc: '2026-09-24T12:30:00Z', timingConfirmed: true, dataStatus: 'STALE', releaseStatus: 'RELEASED' },
      { releaseTimeUtc: '2026-09-25T12:30:00Z', timingConfirmed: true, dataStatus: 'LIVE', releaseStatus: 'RELEASED' },
      upcoming(false, 'UNCONFIRMED'),
    ];
    expect(calendarHealth(events, now)).toMatchObject({ timingUnconfirmed: 1, dataProblems: 2, noConsensus: 0 });
    expect(calendarDataWarning(events, now)).toBe('Calendar: 1/4 events have unconfirmed timing; 2/4 events have a missing actual or a stale snapshot');
  });

  it('without releaseStatus, uses the release time to tell released from upcoming', () => {
    expect(calendarHealth([{ releaseTimeUtc: '2026-09-20T00:00:00Z', timingConfirmed: true, dataStatus: 'MISSING' }], now).dataProblems).toBe(1);
    expect(calendarHealth([{ releaseTimeUtc: '2026-10-20T00:00:00Z', timingConfirmed: true, dataStatus: 'MISSING' }], now).noConsensus).toBe(1);
  });

  it('empty calendar is still reported', () => {
    expect(calendarDataWarning([], now)).toBe('Calendar coverage unavailable');
  });
});

describe('NewsTab dates (calendar day, not shifted by the viewer zone)', () => {
  it('a date-only earnings reportDate shows the day it names', async () => {
    const { formatCalendarDay } = await import('@/lib/eventTimeDisplay');
    expect(formatCalendarDay('2026-09-30')).toBe('Sep 30');
    expect(formatCalendarDay('2026-01-01')).toBe('Jan 1');
    expect(formatCalendarDay('')).toBe('—');
    expect(formatCalendarDay('not a date')).toBe('—');
  });
  it('NewsTab no longer parses bare dates with new Date(), and shows economic releases with their zone', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(require('node:path').resolve(__dirname, '../components/markets/tabs/NewsTab.tsx'), 'utf8');
    expect(src).not.toContain('new Date(e.reportDate)');
    expect(src).not.toContain('new Date(ev.date)');
    expect(src).toContain('formatCalendarDay(e.reportDate)');
    expect(src).toContain('formatEventTime(ev).label');
    const { formatEventTime } = await import('@/lib/eventTimeDisplay');
    // PCE 30 Sep 08:30 ET, seen from Los Angeles, Sydney and with no UTC time.
    expect(formatEventTime({ releaseTimeUtc: '2026-09-30T12:30:00Z', date: '2026-09-30', time: '08:30' }, 'America/Los_Angeles').label).toBe('2026-09-30 05:30 PDT');
    expect(formatEventTime({ releaseTimeUtc: '2026-09-30T12:30:00Z' }, 'Australia/Sydney').label).toMatch(/^2026-09-30 22:30 /);
    expect(formatEventTime({ date: '2026-09-30', time: '08:30' }).label).toBe('2026-09-30 08:30 ET');
  });
});
