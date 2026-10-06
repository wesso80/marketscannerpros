import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatChangePercent } from '@/lib/presentation/formatChangePercent';
import { sectorTone } from '@/lib/overview/today';

describe('Fundamentals change colour', () => {
  const page = readFileSync('app/tools/company-overview/page.tsx', 'utf8');

  it('uses the crypto dashboard flat grey when the change rounds to 0.00%', () => {
    expect(page).toContain('formatChangePercent(data.changePercent) === "0.00%"');
    expect(page).toContain('? sectorTone(0).color');
    expect(readFileSync('components/visual/StatTile.tsx', 'utf8')).toContain('detail === "0.00%" ? sectorTone(0).color');
  });

  it('rounds tiny moves either side of zero to 0.00%', () => {
    for (const v of ['0.004%', '-0.004%', '0%', 0.001, -0.0049]) expect(formatChangePercent(v)).toBe('0.00%');
    expect(formatChangePercent('-0.005%')).toBe('-0.01%');
    expect(sectorTone(0).color).not.toBe('var(--msp-bull)');
    expect(sectorTone(0).color).not.toBe('var(--msp-bear)');
  });
});
