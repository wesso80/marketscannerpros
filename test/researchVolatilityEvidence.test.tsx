// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildVolatilityEvidence } from '@/lib/research/volatilityEvidence';
import { releaseStatement } from '@/lib/research/researchSnapshot';
import type { PriceEvidence } from '@/lib/research/priceEvidence';
import VolatilityEvidencePanel from '@/components/research/VolatilityEvidencePanel';
import PriceEvidencePanel from '@/components/research/PriceEvidencePanel';
afterEach(cleanup);

const pe: PriceEvidence = {
  version: 'v', symbol: 'AAPL', timeframe: 'daily', basis: { lastCompletedBar: '2026-10-06', barsUsed: 500, excludedPartialBar: null, source: 'av' },
  quote: null, close: 333.63, averages: [], adx: { adx: 15.8, plusDI: 20, minusDI: 18 }, rsi14: 52, atr14: 4.1, atrPct: 1.23, volumeRatio: 0.73, bbwp: 10.7, realisedVol20: 18.4,
  states: { trend: 'weak', volatility: 'compressed', volume: 'below average', longerAverages: 'above' }, summary: ['AAPL closed above its 50-day and 200-day simple averages on 2026-10-06.', 'Daily volatility is compressed (BBWP 10.7).'], missing: [],
};
const opts = { expiry: '2026-10-09', snapshotTs: '2026-10-06T20:00:00Z', daysToExpiry: 3, avgIvPct: 24.1, expectedMovePct: 2.3 };

describe('Volatility section', () => {
  it('lists realised and implied measures, each with its basis', () => {
    const v = buildVolatilityEvidence({ assetClass: 'equity', priceEvidence: pe, options: opts, release: { type: 'none', state: 'idle' } });
    const by = Object.fromEntries(v.rows.map((r) => [r.id, r]));
    expect(by.atr.value).toBe('4.1 (1.23% of close)');
    expect(by.realised.value).toBe('18.4%');
    expect(by.bbwp.value).toBe('10.7 (compressed)');
    expect(by.iv.value).toBe('24.1%');
    expect(by.iv.basis).toBe('expiry 2026-10-09, quotes 2026-10-06');
    expect(by['expected-move'].basis).toContain('a size, not a direction');
    expect(v.summary).toEqual([
      'Daily volatility is compressed (BBWP 10.7).',
      'A volatility release has not been recorded.',
      'Options implied volatility (24.1%, quotes 2026-10-06) is 5.7 points above 20-day realised volatility (18.4%, bar 2026-10-06).',
    ]);
    expect(v.notes).toEqual([]);
  });
  it('notes different dates and a differing Volatility-page BBWP; missing values stay missing', () => {
    const v = buildVolatilityEvidence({ assetClass: 'equity', priceEvidence: pe, options: { ...opts, snapshotTs: '2026-10-03T20:00:00Z', avgIvPct: null }, dveBbwp: 31 });
    expect(v.rows.find((r) => r.id === 'iv')!.value).toBe('Not available');
    expect(v.summary.join(' ')).not.toContain('implied volatility');
    expect(v.notes.join(' ')).toContain('BBWP is 31');
    expect(v.notes.join(' ')).toContain('Options quotes (2026-10-03) and the daily bar (2026-10-06) are from different dates.');
    const none = buildVolatilityEvidence({ assetClass: 'equity', priceEvidence: null, options: null });
    expect(none.rows.every((r) => r.value === 'Not available')).toBe(true);
    expect(none.rows.find((r) => r.id === 'iv')!.basis).toBe('options chain not collected');
  });
  it('crypto has no options rows', () => {
    expect(buildVolatilityEvidence({ assetClass: 'crypto', priceEvidence: pe }).rows.map((r) => r.id)).toEqual(['atr', 'realised', 'bbwp']);
  });
  it('release wording: nothing before load, stated quietly when asked', () => {
    expect(releaseStatement(undefined, 'compressed', true)).toBeNull();
    expect(releaseStatement({ type: 'none', state: 'idle' }, 'normal')).toBeNull();
    expect(releaseStatement({ type: 'none', state: 'idle' }, 'normal', true)).toBe('No volatility release signal is recorded on the latest reading.');
    expect(releaseStatement({ type: 'compression_release_down', state: 'fired' }, 'compressed')).toBe('A volatility release was recorded (downward).');
  });
  it('renders; the price panel can leave out volatility rows', () => {
    const { container } = render(<VolatilityEvidencePanel v={buildVolatilityEvidence({ assetClass: 'equity', priceEvidence: pe, options: opts })} />);
    expect(container.querySelectorAll('[data-volatility-row]')).toHaveLength(5);
    expect(container.textContent).not.toMatch(/\b(buy|sell|likely|probability|score)\b/i);
    cleanup();
    const p = render(<PriceEvidencePanel e={pe} section="price" />).container.textContent!;
    expect(p).not.toContain('BBWP');
    expect(p).not.toContain('ATR14');
    expect(p).toContain('RSI14');
  });
  it('Symbol shows Price and structure, then Volatility, for equities and crypto', () => {
    const src = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    expect(src.split('<PriceEvidencePanel e={ge.priceEvidence} section="price"/></CollapsibleSection>}{volatilityFold}').length).toBe(3);
    expect(src).toContain('<VolatilityEvidencePanel v={volatilityEvidence}/>');
  });
});
