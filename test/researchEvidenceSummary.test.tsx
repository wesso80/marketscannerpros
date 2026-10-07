// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildEvidenceSummary } from '@/lib/research/evidenceSummary';
import { buildResearchSnapshot } from '@/lib/research/researchSnapshot';
import { buildVolatilityEvidence } from '@/lib/research/volatilityEvidence';
import type { PriceEvidence } from '@/lib/research/priceEvidence';
import type { TimingEvidence } from '@/lib/research/timingEvidence';
import EvidenceSummaryPanel from '@/components/research/EvidenceSummaryPanel';
afterEach(cleanup);

const pe: PriceEvidence = {
  version: 'v', symbol: 'AAPL', timeframe: 'daily', basis: { lastCompletedBar: '2026-10-06', barsUsed: 500, excludedPartialBar: '2026-10-07', source: 'av' },
  quote: { price: 335.1, at: '2026-10-07T10:35:00Z', source: 'av' }, close: 333.63, averages: [], adx: { adx: 15.8, plusDI: 20, minusDI: 18 }, rsi14: 52.3, atr14: 4.1, atrPct: 1.23, volumeRatio: 0.73, bbwp: 10.7, realisedVol20: 18.4,
  states: { trend: 'weak', volatility: 'compressed', volume: 'below average', longerAverages: 'above' }, summary: [], missing: [],
};
const te: TimingEvidence = {
  version: 'v', asOfUtc: '2026-10-07T10:40:00Z', session: { state: 'pre-market', sessionDate: '2026-10-07', earlyClose: false, nextOpenUtc: null, nextCloseUtc: null, note: '' },
  closes: [{ timeframe: 'daily', closesAtUtc: '2026-10-07T20:00:00.000Z', label: '' }],
  earnings: { date: '2026-10-30', status: 'scheduled', sessionsAway: 17, lastReportedQuarter: null }, releases: [], releasesBasis: { source: 'c', horizonDays: 7, status: 'available' }, summary: [],
};
const canonical = { symbol: 'AAPL', assetClass: 'equity' as const, priceTs: '2026-10-07T10:35:00Z', lastCompletedBarAt: '2026-10-06', source: 'av', dataTrust: { level: 'GOOD', label: 'Good', reasons: [] },
  options: { expiry: '2026-10-09', snapshotTs: '2026-10-05T20:00:00Z', avgIvPct: 24.1, quality: { level: 'GOOD', reasons: [] } }, fundamentals: { lastReportedQuarter: '2026-06-30' } };
const build = () => {
  const snapshot = buildResearchSnapshot({ canonical, priceEvidence: pe, timingEvidence: te });
  const options = { expiry: '2026-10-09', snapshotTs: '2026-10-05T20:00:00Z', putCallOi: 0.58, avgIvPct: 24.1 };
  const volatility = buildVolatilityEvidence({ assetClass: 'equity', priceEvidence: pe, options: { ...options, daysToExpiry: 3, expectedMovePct: 2.3 } });
  return buildEvidenceSummary({ symbol: 'AAPL', assetClass: 'equity', snapshot, priceEvidence: pe, volatility, timing: te, options, fundamentals: { lastReportedQuarter: '2026-06-30', revenueGrowthYoy: 0.081, earningsGrowthYoy: 0.12 } });
};

describe('Evidence summary', () => {
  it('groups observations by input and counts distinct input families, not lines', () => {
    const s = build();
    expect(s.groups.map((g) => g.input)).toEqual(['price-history', 'volume', 'options', 'fundamentals', 'calendar']);
    expect(s.groups[0].observations).toHaveLength(5);
    expect(s.groups[2].observations[0]).toBe('Put/call open interest 0.58, call-heavy (2026-10-09 expiry, strikes within ±30% of spot, quotes 2026-10-05)');
    expect(s.groups[3].observations[0]).toBe('Revenue +8.1% and earnings +12.0% year on year (quarter 2026-06-30)');
    expect(s.independenceNote).toContain('10 observations from 5 distinct input families');
    expect(s.independenceNote).toContain('not separate confirmations');
    expect(s.headline).toBe('10 observations from 5 distinct input families · 3 differences · 0 missing or partial');
  });
  it('records where dates and methods differ, and what to check again', () => {
    const s = build();
    expect(s.differences[0]).toBe('Latest price 335.1 (2026-10-07 10:35 UTC) is +0.44% from the 2026-10-06 close (333.63) used by the daily measures.');
    expect(s.differences).toContain('The unfinished 2026-10-07 daily bar is not used; daily measures describe 2026-10-06.');
    expect(s.differences.join(' ')).toContain('Options quotes (2026-10-05) and the daily bar (2026-10-06) are from different dates.');
    expect(s.recheck).toEqual([
      'Daily measures update after the next daily close (2026-10-07 20:00 UTC).',
      'Options quotes are from 2026-10-05; check again when the chain refreshes.',
      'Review after the next known event: Earnings 2026-10-30 (17 sessions away).',
    ]);
  });
  it('lists missing data and draws no conclusion', () => {
    const snapshot = buildResearchSnapshot({ canonical: { ...canonical, options: null, fundamentals: null }, priceEvidence: null, timingEvidence: null });
    const s = buildEvidenceSummary({ symbol: 'AAPL', assetClass: 'equity', snapshot });
    expect(s.groups).toEqual([]);
    expect(s.missing).toContain('Options: Options chain not collected.');
    expect(s.independenceNote).toBe('No observations.');
    const { container } = render(<EvidenceSummaryPanel s={build()} />);
    expect(container.querySelectorAll('[data-evidence-group]')).toHaveLength(5);
    expect(container.textContent).not.toMatch(/\b(buy|sell|bullish|bearish|likely|probability|score|grade)\b/i);
  });
  it('is the last research section on Symbol, before the scenario map', () => {
    const src = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    const eq = src.lastIndexOf('{evidenceFold}');
    expect(eq).toBeGreaterThan(src.indexOf('title="News and ownership"'));
    expect(eq).toBeLessThan(src.indexOf('title="Scenario map"'));
    expect(src).toContain('<SymbolNewsPanel symbol={sym} type="crypto"/></CollapsibleSection>}{evidenceFold}');
  });
});
