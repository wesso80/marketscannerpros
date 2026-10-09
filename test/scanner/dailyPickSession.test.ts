import { expect, it } from 'vitest';
import { dailyPickHeader } from '@/lib/scanner/dailyPickSession';
import { symbolsBehindEquitySession } from '@/lib/scanner/equityScanRefresh';
import { formatSessionDate, lastCompletedUsSessionDate, nyCalendarDaysBetween } from '@/lib/time/usSession';

it('dates the daily-pick header from the equity rows, and says so when they are behind the last closed session', () => {
  // Friday 9 Oct 2026 15:00 UTC is 11:00 ET, so the last completed US session is Thu 8 Oct.
  const now = Date.parse('2026-10-09T15:00:00Z');
  expect(lastCompletedUsSessionDate(now)).toBe('2026-10-08');
  const header = dailyPickHeader([
    { asset_class: 'equity', barDate: '2026-10-07', scan_date: '2026-10-08' },
    { asset_class: 'equity', barDate: '2026-10-07', scan_date: '2026-10-08' },
    { asset_class: 'crypto', barDate: '2026-10-08', scan_date: '2026-10-08' },
  ], now);
  expect(header).toEqual({
    sessionDate: '2026-10-07',
    pricesStale: true,
    pricesAsOfNote: 'Prices as of Wed 7 Oct 2026.',
  });
  expect(formatSessionDate(header!.sessionDate)).toBe('Wed 7 Oct 2026');
});

it('keeps a current equity session free of the prices-as-of note', () => {
  const now = Date.parse('2026-10-09T15:00:00Z');
  const header = dailyPickHeader([
    { asset_class: 'equity', barDate: '2026-10-08' },
    { asset_class: 'crypto', barDate: '2026-10-09' },
  ], now);
  expect(header).toEqual({ sessionDate: '2026-10-08', pricesStale: false, pricesAsOfNote: null });
});

it('skips equity symbols that already have the last completed session stored', () => {
  expect(symbolsBehindEquitySession(
    [{ symbol: 'AAPL', scanDate: '2026-10-08' }, { symbol: 'NVDA', scanDate: '2026-10-07' }],
    '2026-10-08',
    ['AAPL', 'NVDA', 'MSFT'],
  )).toEqual(['NVDA', 'MSFT']);
  expect(symbolsBehindEquitySession(
    [{ symbol: 'AAPL', scanDate: '2026-10-08' }],
    '2026-10-08',
    ['AAPL'],
  )).toEqual([]);
});

it('counts daysUntilMajor as New York calendar dates, so 9.6 hours later the same day is 0', () => {
  const from = Date.parse('2026-10-09T14:00:00Z'); // 10:00 ET
  const sameDay = Date.parse('2026-10-09T23:36:00Z'); // 19:36 ET, 9.6 hours later
  const nextDay = Date.parse('2026-10-10T05:00:00Z'); // 01:00 ET on 10 Oct
  expect(nyCalendarDaysBetween(from, sameDay)).toBe(0);
  expect(nyCalendarDaysBetween(from, nextDay)).toBe(1);
  expect(sameDay - from).toBeLessThan(24 * 60 * 60 * 1000);
});
