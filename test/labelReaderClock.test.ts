import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { labelReaderClock } from '@/lib/eventTimeDisplay';

const sydneyEvening = Date.parse('2026-10-06T09:00:00Z');

it('labels a bare clock in Sydney with AEDT and keeps the approximate mark', () => {
  expect(labelReaderClock('20:00', sydneyEvening, 'Australia/Sydney')).toBe('20:00 AEDT');
  expect(labelReaderClock('~20:00', sydneyEvening, 'Australia/Sydney')).toBe('~20:00 AEDT');
});

it('leaves clocks that already name a zone, and leaves sentences, unchanged', () => {
  expect(labelReaderClock('08:30 JST', sydneyEvening, 'Australia/Sydney')).toBe('08:30 JST');
  expect(labelReaderClock('8:30 PM ET', sydneyEvening, 'Australia/Sydney')).toBe('8:30 PM ET');
  expect(labelReaderClock('Release around ~20:00', sydneyEvening, 'Australia/Sydney')).toBe('Release around ~20:00');
  expect(labelReaderClock('~20:00', Number.NaN, 'Australia/Sydney')).toBe('~20:00');
});

it('labels Calendar Intelligence user clocks and leaves the release instant alone', () => {
  const page = readFileSync('app/tools/economic-calendar/page.tsx', 'utf8');
  expect(page).toContain('return labelReaderClock(clock, event.releaseMs, timeZone)');
  expect(page).toContain('displayTime(event, timeMode, userTz)');
  expect(page).not.toMatch(/displayTime\(event, timeMode\)/);
  expect(readFileSync('lib/macro/calendar/normalize.ts', 'utf8')).not.toContain('labelReaderClock');
});
