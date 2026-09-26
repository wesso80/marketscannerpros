/** SC-8 (crypto -USD label), SC-9 (sweeps only on completed bars), SC-10 (Pro price column), SC-11 (re-run prompt). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatScannerPrice, proDisplaySymbol } from '@/lib/scanner/proDisplay';
import { completedEquityDailyBars } from '@/lib/scanner/equityScanInputs';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('SC-8: Pro crypto rows read as coins', () => {
  it('adds -USD to crypto symbols only, once', () => {
    expect(proDisplaySymbol('AR', 'crypto')).toBe('AR-USD');
    expect(proDisplaySymbol('SUI-USD', 'crypto')).toBe('SUI-USD');
    expect(proDisplaySymbol('AR', 'equity')).toBe('AR');
  });
  it('table and cards show the display label; analysis still opens with the asset class', () => {
    expect(read('components/scanner/ScreenerTable.tsx')).toContain('r.displaySymbol ?? r.symbol');
    const page = read('app/tools/scanner/page.tsx');
    expect(page).toContain('displaySymbol: proDisplaySymbol(pick.symbol');
    expect(page).toMatch(/loadSymbolDetail\(row\.symbol, tf, proAsset/);
  });
});

describe('SC-10: Pro table has a price column', () => {
  it('formats prices from BTC to sub-cent coins', () => {
    expect(formatScannerPrice(84379.5)).toBe('84,379.50');
    expect(formatScannerPrice(516.59)).toBe('516.59');
    expect(formatScannerPrice(0.1182)).toBe('0.1182');
    expect(formatScannerPrice(0.00001234)).toBe('0.0000123');
    expect(formatScannerPrice(undefined)).toBe('—');
  });
  it('the Pro table defines a Price column', () => {
    expect(read('components/scanner/ScreenerTable.tsx')).toMatch(/key: 'price', label: 'Price'/);
  });
});

describe('SC-9: liquidity sweeps only use completed sessions', () => {
  const bars = [{ date: '2026-09-23' }, { date: '2026-09-24' }, { date: '2026-09-25' }];
  it("drops today's unfinished bar while the US market is open", () => {
    // Fri 25 Sep 17:25 UTC = 13:25 EDT (open): last completed session is 24 Sep.
    expect(completedEquityDailyBars(bars, Date.parse('2026-09-25T17:25:00Z')).map((b) => b.date)).toEqual(['2026-09-23', '2026-09-24']);
    // After the close the 25 Sep bar is complete.
    expect(completedEquityDailyBars(bars, Date.parse('2026-09-25T20:05:00Z')).map((b) => b.date)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
  });
  it('the sweep route filters equity bars to completed sessions', () => {
    expect(read('app/api/liquidity-sweep/route.ts')).toContain('completedEquityDailyBars(ohlcv)');
  });
});

describe('SC-11: changing filters says to re-run instead of silently emptying', () => {
  it('shows a prompt with a Re-run button when the last results no longer match the controls', () => {
    const page = read('app/tools/scanner/page.tsx');
    expect(page).toContain('const proResultsOutdated = Boolean(proResponse) && !proScanResults;');
    expect(page).toMatch(/proResultsOutdated && !proScanLoading[\s\S]{0,400}Filters or sort changed since the last scan[\s\S]{0,400}onClick=\{runProScan\}/);
  });
});
