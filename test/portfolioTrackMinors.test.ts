/** Portfolio Track minors: TR-6, TR-7, TR-14, TR-15, TR-35. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDateInput, paperCloseDateIso, positionLimitLabel, profitFactorDisplay } from '@/lib/portfolio/trackDisplay';

const page = readFileSync(join(process.cwd(), 'app/tools/portfolio/page.tsx'), 'utf8');

describe('TR-6: profit factor', () => {
  it('is gross profit / gross loss, and says "No losses" instead of 9.99', () => {
    expect(profitFactorDisplay([100, -50, 50])).toEqual({ value: 3, label: '3.00' });
    expect(profitFactorDisplay([100, 20])).toMatchObject({ value: null, label: 'No losses' });
    expect(profitFactorDisplay([])).toMatchObject({ value: null, label: 'N/A' });
    expect(profitFactorDisplay([0])).toMatchObject({ value: null, label: 'N/A' });
    expect(page).not.toMatch(/\? 9\.99/);
    expect(page).toContain("{ label: 'Profit Factor', value: profitFactor.label, title: profitFactor.detail }");
  });
});

describe('TR-7: position limit', () => {
  it('never prints Infinity', () => {
    expect(positionLimitLabel(6, Infinity)).toBe('6 open (no limit)');
    expect(positionLimitLabel(3, 5)).toBe('3/5');
    expect(page).toContain("value: positionLimitWhenReady(positions.length, getPortfolioLimit(tier), dataLoaded && !tierLoading)");
  });
});

describe('TR-14: section tabs on phones', () => {
  it('wrap below the sm breakpoint', () => {
    expect(page).toContain("mt-3 flex-wrap sm:flex-nowrap ${embeddedInWorkspace ? 'flex gap-2 overflow-x-auto pb-1'");
  });
});

describe('TR-15: one Add Position, Clear All Data set apart', () => {
  it('hides the duplicate add button when embedded and puts Clear All Data last', () => {
    const start = page.indexOf('const portfolioHeaderActions = (');
    const block = page.slice(start, page.indexOf('if (tier === \'anonymous\')', start));
    expect(block).toMatch(/\{!embeddedInWorkspace && \(\s*<button[\s\S]*?Add Position/);
    expect(block.indexOf('Clear All Data')).toBeGreaterThan(block.indexOf('Model Allocation'));
  });
});

describe('TR-35: in-page close form', () => {
  it('no window.prompt; form has price, date and a P&L preview', () => {
    expect(page).not.toContain('window.prompt(');
    expect(page).toContain('aria-labelledby="close-form-title"');
    expect(page).toContain('data-testid="close-form-preview"');
    expect(page).toMatch(/const closePosition = \(id: number\) => openCloseForm\(id, 1\);/);
    expect(page).toMatch(/const reducePositionHalf = \(id: number\) => openCloseForm\(id, 0\.5\);/);
  });
  it('close dates: today keeps the time, earlier days are local noon, future is refused', () => {
    const now = new Date(2026, 8, 26, 15, 30);
    expect(localDateInput(now)).toBe('2026-09-26');
    expect(paperCloseDateIso('2026-09-26', now)).toBe(now.toISOString());
    expect(paperCloseDateIso('2026-09-24', now)).toBe(new Date(2026, 8, 24, 12).toISOString());
    expect(paperCloseDateIso('2026-09-27', now)).toBeNull();
    expect(paperCloseDateIso('2026-02-31', now)).toBeNull();
    expect(paperCloseDateIso('bad', now)).toBeNull();
  });
});
