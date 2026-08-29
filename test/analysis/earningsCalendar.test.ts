import { describe, it, expect } from 'vitest';
import { parseEarningsCalendarCsv, daysUntilEarnings } from '@/lib/scanner/earningsCalendar';

describe('parseEarningsCalendarCsv', () => {
  it('maps each symbol to its earliest upcoming report date', () => {
    const csv = [
      'symbol,name,reportDate,fiscalDateEnding,estimate,currency',
      'AAPL,Apple,2026-10-30,2026-09-30,1.5,USD',
      'AAPL,Apple,2027-01-28,2026-12-31,1.6,USD',
      'MSFT,Microsoft,2026-10-25,2026-09-30,2.9,USD',
    ].join('\n');
    const map = parseEarningsCalendarCsv(csv);
    expect(map.get('AAPL')).toBe('2026-10-30');
    expect(map.get('MSFT')).toBe('2026-10-25');
  });

  it('is defensive about empty or headerless input', () => {
    expect(parseEarningsCalendarCsv('').size).toBe(0);
    expect(parseEarningsCalendarCsv('symbol,name\nAAPL,Apple').size).toBe(0);
  });

  it('uppercases symbols', () => {
    const csv = 'symbol,reportDate\naapl,2026-10-30';
    expect(parseEarningsCalendarCsv(csv).get('AAPL')).toBe('2026-10-30');
  });
});

describe('daysUntilEarnings', () => {
  const from = new Date('2026-10-28T12:00:00Z');
  it('counts whole days until an upcoming date', () => {
    expect(daysUntilEarnings('2026-10-30', from)).toBe(2);
    expect(daysUntilEarnings('2026-10-28', from)).toBe(0);
  });
  it('returns null for past dates and invalid input', () => {
    expect(daysUntilEarnings('2026-10-20', from)).toBeNull();
    expect(daysUntilEarnings(undefined, from)).toBeNull();
    expect(daysUntilEarnings('not-a-date', from)).toBeNull();
  });
});
