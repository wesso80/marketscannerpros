import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatEventTime, zoneAbbreviation } from '../lib/eventTimeDisplay';
import { summarizeEventClock } from '../lib/analysis/commandCenter';

// Live evidence (OV-4): PCE 2026-09-30 08:30 ET and NFP 2026-10-02 08:30 ET were shown as bare "08:30".
const pce = { event: 'PCE Price Index YoY', impact: 'high', country: 'US', date: '2026-09-30', time: '08:30', releaseTimeUtc: '2026-09-30T12:30:00.000Z' };
const nfp = { event: 'Non-Farm Payrolls', impact: 'high', country: 'US', date: '2026-10-02', time: '08:30', releaseTimeUtc: '2026-10-02T12:30:00.000Z' };
// RS-7 row: 21:30 ET on 1 Oct is the next day in Sydney.
const abs = { event: 'Monthly Household Spending Indicator MoM', date: '2026-10-01', time: '21:30', releaseTimeUtc: '2026-10-02T01:30:00.000Z' };

describe('OV-4: event times carry a time zone', () => {
  it('renders in the viewer zone with its abbreviation (Sydney reader)', () => {
    const shown = formatEventTime(pce, 'Australia/Sydney');
    expect(shown.label).toBe('2026-09-30 22:30 AEST');
    expect(shown.time).toBe('22:30 AEST');
    expect(shown.title).toContain('2026-09-30 08:30 ET');
    expect(shown.title).toContain('2026-09-30T12:30:00Z UTC');
    expect(formatEventTime(nfp, 'Australia/Sydney').label).toBe('2026-10-02 22:30 AEST');
  });

  it('moves the date when the viewer is on the next calendar day', () => {
    expect(formatEventTime(abs, 'Australia/Sydney').label).toBe('2026-10-02 11:30 AEST');
    expect(formatEventTime(abs, 'America/New_York').label).toBe('2026-10-01 21:30 EDT');
  });

  it('follows daylight saving in the viewer zone', () => {
    // Sydney switches to AEDT on 4 Oct 2026.
    const cpi = { releaseTimeUtc: '2026-10-14T12:30:00Z' };
    expect(formatEventTime(cpi, 'Australia/Sydney').label).toBe('2026-10-14 23:30 AEDT');
  });

  it('uses a GMT offset when no letter abbreviation exists', () => {
    expect(zoneAbbreviation(Date.parse('2026-09-30T12:30:00Z'), 'Asia/Tokyo')).toMatch(/^(JST|GMT\+9)$/);
    expect(formatEventTime(pce, 'UTC').label).toBe('2026-09-30 12:30 UTC');
  });

  it('labels the legacy ET fields "ET" when there is no UTC time', () => {
    const shown = formatEventTime({ date: '2026-09-30', time: '08:30' }, 'Australia/Sydney');
    expect(shown.label).toBe('2026-09-30 08:30 ET');
    expect(shown.zone).toBe('ET');
    expect(formatEventTime({ date: '2026-09-30' }, 'Australia/Sydney').label).toBe('2026-09-30');
    expect(formatEventTime({}, 'Australia/Sydney').label).toBe('Scheduled');
    expect(formatEventTime({ releaseTimeUtc: 'not a date', date: '2026-09-30', time: '08:30' }).label).toBe('2026-09-30 08:30 ET');
  });

  it('Session overview event clock shows the zone (no bare 08:30)', () => {
    const [first, second] = summarizeEventClock([pce, nfp], 5, 'Australia/Sydney');
    expect(first.when).toBe('2026-09-30 22:30 AEST');
    expect(first.whenTitle).toContain('08:30 ET');
    expect(second.when).toBe('2026-10-02 22:30 AEST');
    const [legacy] = summarizeEventClock([{ event: 'CPI', date: '2026-08-29', time: '08:30' }], 5, 'Australia/Sydney');
    expect(legacy.when).toBe('2026-08-29 08:30 ET');
  });

  it('dashboard and Research calendar render through the zone-aware helper', () => {
    const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
    for (const file of ['app/tools/dashboard/page.tsx', 'app/tools/research/page.tsx']) {
      const src = read(file);
      expect(src).toMatch(/from '@\/lib\/eventTimeDisplay'/);
      expect(src).not.toMatch(/\{e\.time \|\| '—'\}/);
      expect(src).toMatch(/\{shown\.time \|\| '—'\}/);
    }
    expect(read('app/tools/research/page.tsx')).toMatch(/Time \(your zone\)/);
    expect(read('app/tools/command-center/page.tsx')).toMatch(/title=\{e\.whenTitle\}/);
  });
});
