import { describe, expect, it } from 'vitest';
import { calendarTimingNote, releaseReadingLabel } from '@/lib/calendarPresentation';

describe('calendar reading labels', () => {
  it('names a missing consensus without the MISSING token', () => {
    expect(releaseReadingLabel({
      timingConfirmed: true,
      dataStatus: 'MISSING',
      statusDetail: 'Consensus not available for this release.',
    })).toBe('Consensus not available for this release.');
    expect(releaseReadingLabel({ timingConfirmed: true, dataStatus: 'MISSING', statusDetail: 'MISSING' })).toBe('Consensus figure not available yet.');
  });

  it('names an unconfirmed release time without inventing one', () => {
    expect(releaseReadingLabel({
      timingConfirmed: false,
      dataStatus: 'UNCONFIRMED',
      statusDetail: 'Release time is estimated, not confirmed by an official schedule.',
    })).toBe('Release time is estimated, not confirmed by an official schedule.');
  });

  it('counts unconfirmed times in plain words', () => {
    const events = [
      { timingConfirmed: true, dataStatus: 'MISSING', releaseTimeUtc: '2099-10-14T12:30:00.000Z' },
      { timingConfirmed: false, dataStatus: 'UNCONFIRMED', releaseTimeUtc: '2099-10-12T12:00:00.000Z' },
    ];
    expect(calendarTimingNote(events)).toBe('1 of 2 release times is not confirmed yet.');
    expect(calendarTimingNote([])).toBeNull();
  });
});
