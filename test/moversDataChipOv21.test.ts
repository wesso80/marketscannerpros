/** OV-21: the Movers "Data" chip follows the equity feed actually received instead of always saying "Live". */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isUsRegularSessionOpen, moversDataChipLabel } from '@/lib/alphaVantageEntitlement';

describe('moversDataChipLabel', () => {
  it('crypto is live; equities follow equityFeed (and the US session for the realtime feed)', () => {
    const friOpen = Date.parse('2026-09-25T15:00:00Z'); // Fri 11:00 ET
    const sat = Date.parse('2026-09-26T13:00:00Z');
    const holiday = Date.parse('2026-11-26T16:00:00Z'); // Thanksgiving 11:00 ET
    expect(moversDataChipLabel('realtime', friOpen)).toBe('Crypto live · equities realtime');
    expect(moversDataChipLabel(undefined, friOpen)).toBe('Crypto live · equities realtime');
    expect(moversDataChipLabel('realtime', sat)).toBe('Crypto live · equities market closed');
    expect(moversDataChipLabel('realtime', holiday)).toBe('Crypto live · equities market closed');
    expect(moversDataChipLabel('end_of_day', friOpen)).toBe('Crypto live · equities end of day');
    expect(moversDataChipLabel('unavailable', friOpen)).toBe('Crypto live · equities unavailable');
  });
  it('isUsRegularSessionOpen: 09:30–16:00 ET on trading days', () => {
    expect(isUsRegularSessionOpen(Date.parse('2026-09-25T13:29:00Z'))).toBe(false); // 09:29 ET
    expect(isUsRegularSessionOpen(Date.parse('2026-09-25T13:30:00Z'))).toBe(true);
    expect(isUsRegularSessionOpen(Date.parse('2026-09-25T19:59:00Z'))).toBe(true);
    expect(isUsRegularSessionOpen(Date.parse('2026-09-25T20:00:00Z'))).toBe(false);
  });
  it('the Movers page chip uses it (no hard-coded "Live")', () => {
    const src = readFileSync('app/tools/market-movers/page.tsx', 'utf8');
    expect(src).toContain("['Data', loading ? 'Refreshing' : error ? 'Degraded' : moversDataChipLabel(data?.equityFeed)]");
    expect(src).not.toContain("error ? 'Degraded' : 'Live']");
    expect(src).not.toContain('badge="Live"');
    expect(src).toContain("badge={data?.equityFeed === 'end_of_day' ? 'End of day'");
  });
});
