/** OV-21: the Movers "Data" chip follows the equity feed actually received instead of always saying "Live". */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moversDataChipLabel } from '@/lib/alphaVantageEntitlement';

describe('moversDataChipLabel', () => {
  it('crypto is live; equities follow equityFeed', () => {
    expect(moversDataChipLabel('delayed')).toBe('Crypto live · equities 15-min delayed');
    expect(moversDataChipLabel('end_of_day')).toBe('Crypto live · equities end of day');
    expect(moversDataChipLabel('unavailable')).toBe('Crypto live · equities unavailable');
    expect(moversDataChipLabel(undefined)).toBe('Crypto live · equities 15-min delayed');
  });
  it('the Movers page chip uses it (no hard-coded "Live")', () => {
    const src = readFileSync('app/tools/market-movers/page.tsx', 'utf8');
    expect(src).toContain("['Data', loading ? 'Refreshing' : error ? 'Degraded' : moversDataChipLabel(data?.equityFeed)]");
    expect(src).not.toContain("error ? 'Degraded' : 'Live']");
    expect(src).not.toContain('badge="Live"');
    expect(src).toContain("badge={data?.equityFeed === 'end_of_day' ? 'End of day'");
  });
});
