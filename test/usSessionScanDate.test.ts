import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatSessionDate, lastCompletedUsSessionDate, latestUsSessionDate, toYmd, usSessionsBetween,
} from '../lib/time/usSession';

const at = (iso: string) => Date.parse(iso);

describe('daily scan date = the US market session the data belongs to', () => {
  it('the 7:30 AM AEST run (21:30 UTC) is dated with the US session that just closed', () => {
    // Sat 26 Sep 07:30 AEST = Fri 25 Sep 21:30 UTC = Fri 17:30 New York
    expect(latestUsSessionDate(at('2026-09-25T21:30:00Z'))).toBe('2026-09-25');
    // Tue 29 Sep 07:30 AEST = Mon 28 Sep 21:30 UTC
    expect(latestUsSessionDate(at('2026-09-28T21:30:00Z'))).toBe('2026-09-28');
  });

  it('weekend runs keep Friday\'s session date instead of inventing a Saturday or Sunday', () => {
    expect(latestUsSessionDate(at('2026-09-26T21:30:00Z'))).toBe('2026-09-25'); // Sat evening UTC
    expect(latestUsSessionDate(at('2026-09-27T21:30:00Z'))).toBe('2026-09-25'); // Sun evening UTC
    expect(latestUsSessionDate(at('2026-09-28T10:00:00Z'))).toBe('2026-09-25'); // Mon before the open
  });

  it('a run just after UTC midnight still belongs to the previous New York day', () => {
    expect(latestUsSessionDate(at('2026-09-29T01:00:00Z'))).toBe('2026-09-28'); // Mon 21:00 New York
  });

  it('skips US market holidays', () => {
    // Thanksgiving Thu 26 Nov 2026: the evening run that day belongs to Wed 25 Nov.
    expect(latestUsSessionDate(at('2026-11-26T22:30:00Z'))).toBe('2026-11-25');
  });

  it('the scan-universe run during the session (19:35 UTC) gets the same date as that evening\'s daily scan', () => {
    expect(latestUsSessionDate(at('2026-09-25T19:35:00Z'))).toBe(latestUsSessionDate(at('2026-09-25T21:30:00Z')));
  });

  it('last completed session honours the New York close, including US winter time and early closes', () => {
    // Summer (EDT): 16:00 NY = 20:00 UTC
    expect(lastCompletedUsSessionDate(at('2026-09-25T19:59:00Z'))).toBe('2026-09-24');
    expect(lastCompletedUsSessionDate(at('2026-09-25T20:00:00Z'))).toBe('2026-09-25');
    // Winter (EST): 16:00 NY = 21:00 UTC, so 20:30 UTC is still inside the session
    expect(lastCompletedUsSessionDate(at('2026-12-02T20:30:00Z'))).toBe('2026-12-01');
    expect(lastCompletedUsSessionDate(at('2026-12-02T21:00:00Z'))).toBe('2026-12-02');
    // Day after Thanksgiving closes at 13:00 NY (18:00 UTC in winter)
    expect(lastCompletedUsSessionDate(at('2026-11-27T18:05:00Z'))).toBe('2026-11-27');
  });

  it('counts sessions, not calendar days, across weekends', () => {
    expect(usSessionsBetween('2026-09-25', '2026-09-28')).toBe(1); // Fri -> Mon
    expect(usSessionsBetween('2026-09-24', '2026-09-28')).toBe(2);
    expect(usSessionsBetween('2026-09-25', '2026-09-25')).toBe(0);
  });

  it('reads a DATE column without a time-zone shift, and formats it the same everywhere', () => {
    expect(toYmd(new Date(2026, 8, 25))).toBe('2026-09-25'); // node-postgres: local midnight
    expect(toYmd('2026-09-25T00:00:00.000Z')).toBe('2026-09-25');
    expect(toYmd(null)).toBeNull();
    expect(formatSessionDate('2026-09-25')).toBe('Fri 25 Sep 2026');
  });

  it('both daily-pick writers use the session date, not the UTC calendar day', () => {
    for (const f of ['app/api/jobs/scan-daily/route.ts', 'app/api/jobs/scan-universe/route.ts']) {
      const src = readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect(src).toMatch(/latestUsSessionDate\(Date\.now\(\)\)/);
      expect(src).not.toMatch(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
    }
  });
});
