/** TR-37: Profit Factor and the position-limit label show a neutral '…' until their data has loaded. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOADING_LABEL, positionLimitWhenReady, profitFactorWhenReady } from '@/lib/portfolio/trackDisplay';

const page = readFileSync(join(process.cwd(), 'app/tools/portfolio/page.tsx'), 'utf8');

describe('TR-37: no fallback wording before load', () => {
  it('profit factor is "…" while loading, then the real label', () => {
    expect(LOADING_LABEL).toBe('…');
    expect(profitFactorWhenReady([], false)).toMatchObject({ value: null, label: '…' });
    expect(profitFactorWhenReady([100, 20], false).label).toBe('…');
    expect(profitFactorWhenReady([], true).label).toBe('N/A');
    expect(profitFactorWhenReady([100, 20], true).label).toBe('No losses');
    expect(profitFactorWhenReady([100, -50], true)).toEqual({ value: 2, label: '2.00' });
  });

  it('position limit is "…" while loading, then the real label', () => {
    expect(positionLimitWhenReady(0, 3, false)).toBe('…');
    expect(positionLimitWhenReady(6, Infinity, true)).toBe('6 open (no limit)');
    expect(positionLimitWhenReady(3, 5, true)).toBe('3/5');
  });

  it('the page waits for positions (and the tier, for the limit)', () => {
    expect(page).toContain('const { tier, isLoading: tierLoading } = useUserTier();');
    expect(page).toContain('profitFactorWhenReady(closedPositions.map((trade) => trade.realizedPL), dataLoaded)');
    expect(page).toContain("tone: dataLoaded && !tierLoading && positions.length >= getPortfolioLimit(tier) ? 'warn' : 'neutral'");
    expect(page).not.toMatch(/value: positionLimitLabel\(/);
  });
});
