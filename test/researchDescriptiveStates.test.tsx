// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { describeStates } from '@/lib/research/descriptiveStates';
import type { PriceEvidence } from '@/lib/research/priceEvidence';
import DescriptiveStates from '@/components/research/DescriptiveStates';
afterEach(cleanup);

const pe: PriceEvidence = {
  version: 'v', symbol: 'AAPL', timeframe: 'daily', basis: { lastCompletedBar: '2026-10-06', barsUsed: 500, excludedPartialBar: null, source: 'av' },
  quote: null, close: 333.63, averages: [], adx: { adx: 15.8, plusDI: 20, minusDI: 18 }, rsi14: 52, atr14: 4, atrPct: 1.2, volumeRatio: 0.73, bbwp: 10.7, realisedVol20: 18,
  states: { trend: 'weak', volatility: 'compressed', volume: 'below average', longerAverages: 'above' }, summary: [], missing: [],
};

describe('descriptive states (Phase 4)', () => {
  it('describes each measurement with its definition, AAPL case', () => {
    const s = describeStates(pe, { type: 'none', state: 'idle' });
    expect(s.map((x) => [x.id, x.state])).toEqual([
      ['averages', 'above the 50- and 200-day'], ['trend', 'weak (ADX 15.8)'], ['volatility', 'compressed (BBWP 10.7)'], ['volume', 'below average (0.73×)'], ['release', 'not recorded'],
    ]);
    expect(s.find((x) => x.id === 'trend')!.definition).toContain('Strength only, not direction.');
    expect(s.find((x) => x.id === 'release')!.definition).toContain("The engine's compression line (15) differs from this page's (20).");
  });
  it('says "not measured" rather than inventing a state, and omits the release until it loads', () => {
    const s = describeStates(null);
    expect(s.every((x) => x.state === 'not measured')).toBe(true);
    expect(s.map((x) => x.id)).not.toContain('release');
    expect(describeStates(pe, null).find((x) => x.id === 'release')!.state).toBe('not available');
    expect(describeStates(pe, { type: 'compression_release_up', state: 'fired' }).find((x) => x.id === 'release')!.state).toBe('recorded (upward)');
  });
  it('renders states and definitions with no grade, score, probability or permission words', () => {
    const { container } = render(<DescriptiveStates states={describeStates(pe, { type: 'none', state: 'armed' })} />);
    expect(container.querySelectorAll('[data-state]')).toHaveLength(5);
    expect(container.textContent).not.toMatch(/\bgrade\b|\/100|probability|likely|\bready\b|permission|\bbuy\b|\bsell\b/i);
  });
});
