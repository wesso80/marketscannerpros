import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatTradeDate, localDateInputValue, localDateTimeInputValue } from '@/lib/journal/tradeDate';

/**
 * Regression: the New Trade form pre-filled "Trade Date" with new Date().toISOString().slice(0, 10) (the UTC date),
 * so east of UTC (e.g. Sydney before 10:00) it defaulted to yesterday; the close form's datetime-local showed UTC
 * wall time. Journal DATE values ('YYYY-MM-DD' / UTC-midnight ISO) rendered through the browser zone showed the
 * previous day west of UTC.
 */
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('journal date defaults use the local calendar', () => {
  it('local date/time, not the UTC date', () => {
    // Construct with local components so the assertion holds in any test-runner time zone.
    const localMorning = new Date(2026, 8, 26, 8, 5); // 26 Sep 08:05 local
    expect(localDateInputValue(localMorning)).toBe('2026-09-26');
    expect(localDateTimeInputValue(localMorning)).toBe('2026-09-26T08:05');
  });

  it('matches what the old UTC default got wrong for a UTC+10 user', () => {
    // 2026-09-25T22:05Z is 26 Sep 08:05 in UTC+10: the old default showed 2026-09-25.
    const instant = new Date('2026-09-25T22:05:00Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-25');
    const tzOffsetMin = instant.getTimezoneOffset();
    const expectedLocal = new Date(instant.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
    expect(localDateInputValue(instant)).toBe(expectedLocal);
  });
});

describe('journal DATE display has no time-zone shift', () => {
  it('formats the calendar date itself', () => {
    const expected = new Date(Date.UTC(2026, 8, 22)).toLocaleDateString('en-US', { timeZone: 'UTC' });
    expect(formatTradeDate('2026-09-22', 'en-US')).toBe(expected);
    expect(formatTradeDate('2026-09-22T00:00:00.000Z', 'en-US')).toBe(expected);
    expect(formatTradeDate('2026-09-22', 'en-US')).toBe('9/22/2026');
    expect(formatTradeDate('2026-09-22', 'en-AU')).toBe('22/09/2026');
  });

  it('falls back for real timestamps and missing values', () => {
    expect(formatTradeDate(undefined)).toBe('—');
    expect(formatTradeDate('not a date')).toBe('—');
    expect(formatTradeDate('2026-09-22T15:30:00Z', 'en-US')).toBe(new Date('2026-09-22T15:30:00Z').toLocaleDateString('en-US'));
  });
});
