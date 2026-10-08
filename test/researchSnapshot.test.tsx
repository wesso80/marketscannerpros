// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildResearchSnapshot, type SnapshotCanonical } from '@/lib/research/researchSnapshot';
import type { PriceEvidence } from '@/lib/research/priceEvidence';
import type { TimingEvidence } from '@/lib/research/timingEvidence';
import ResearchSnapshotCard from '@/components/research/ResearchSnapshotCard';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
afterEach(cleanup);

const canonical = (o: Partial<SnapshotCanonical> = {}): SnapshotCanonical => ({
  symbol: 'AAPL', assetClass: 'equity', priceTs: '2026-10-07T10:35:00Z', lastCompletedBarAt: '2026-10-06T20:00:00Z', source: 'Alpha Vantage',
  dataTrust: { level: 'GOOD', label: 'Good', reasons: [] },
  options: { expiry: '2026-10-09', snapshotTs: '2026-10-06T20:00:00Z', avgIvPct: 24.1, quality: { level: 'GOOD', reasons: [] } },
  fundamentals: { lastReportedQuarter: '2026-06-30' }, ...o,
});
const pe = (o: Partial<PriceEvidence['states']> = {}): PriceEvidence => ({
  version: 'v', symbol: 'AAPL', timeframe: 'daily', basis: { lastCompletedBar: '2026-10-06', barsUsed: 500, excludedPartialBar: '2026-10-07', source: 'av' },
  quote: null, close: 333.63, averages: [], adx: { adx: 15.8, plusDI: null, minusDI: null }, rsi14: 52, atr14: 4, atrPct: 1.2, volumeRatio: 0.73, bbwp: 10.7, realisedVol20: 18,
  states: { trend: 'weak', volatility: 'compressed', volume: 'below average', longerAverages: 'above', ...o }, summary: [], missing: [],
});
const te: TimingEvidence = {
  version: 'v', asOfUtc: '2026-10-07T10:40:00Z', session: { state: 'closed', sessionDate: null, earlyClose: false, nextOpenUtc: null, nextCloseUtc: null, note: '' }, closes: [],
  earnings: { date: '2026-10-30', status: 'scheduled', sessionsAway: 17, lastReportedQuarter: null },
  releases: [{ name: 'CPI', country: 'US', releaseTimeUtc: '2026-10-14T12:30:00Z', referencePeriod: 'Sep', importance: 'high', timingConfirmed: true, source: 'BLS' }],
  releasesBasis: { source: 'calendar', horizonDays: 7, status: 'available' }, summary: [],
};

describe('research snapshot (Symbol page top)', () => {
  it('describes AAPL in factual sentences, without a verdict', () => {
    const s = buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), timingEvidence: te, volatilityRelease: { type: 'none', state: 'idle' } });
    const text = s.summary.join(' ');
    expect(text).toContain('AAPL is above its longer-term (50- and 200-day) averages.');
    expect(text).toContain('Daily volatility is compressed, with below average volume and weak trend strength.');
    expect(text).toContain('A volatility release has not been recorded.');
    expect(text).toContain('Options open interest for the 2026-10-09 expiry is from 2026-10-06.');
    expect(text).toContain('Next known event: CPI (US) 2026-10-14 12:30 UTC.');
    expect(text).not.toMatch(/\b(buy|sell|grade|score|probability|likely|permission|watch)\b/i);
  });
  it('keeps each kind of date separate', () => {
    const s = buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), timingEvidence: te });
    const by = Object.fromEntries(s.dates.map((d) => [d.id, d]));
    expect(by.quote.value).toBe('2026-10-07T10:35:00Z');
    expect(by.bar.value).toBe('2026-10-06');
    expect(by.bar.basis).toContain('unfinished 2026-10-07 bar excluded');
    expect(by.options.value).toBe('2026-10-06T20:00:00Z');
    expect(by.fundamentals.value).toBe('2026-06-30');
    expect(by.built.basis).toBe('retrieval time');
  });
  it('reports missing data as missing and makes no release statement before the Volatility reading loads', () => {
    const s = buildResearchSnapshot({ canonical: canonical({ options: null, fundamentals: null, dataTrust: { level: 'STALE', label: 'Stale', reasons: ['Last bar 4 sessions old.'] } }), priceEvidence: null, timingEvidence: null });
    const text = s.summary.join(' ');
    expect(text).toContain('Measured daily evidence is not available');
    expect(text).toContain('Options data was not collected.');
    expect(text).toContain('Price data check: Stale (Last bar 4 sessions old)');
    expect(text).not.toMatch(/volatility release/i);
    const st = Object.fromEntries(s.sections.map((x) => [x.id, x.status]));
    expect(st).toEqual({ price: 'missing', volatility: 'missing', options: 'missing', timing: 'missing', fundamentals: 'missing' });
    expect(s.dates.find((d) => d.id === 'options')!.value).toBeNull();
  });
  it('earnings before the first release is the next event; crypto options are not applicable', () => {
    const early = { ...te, earnings: { ...te.earnings!, date: '2026-10-09', sessionsAway: 2 } };
    expect(buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), timingEvidence: early }).nextEvent).toBe('Earnings 2026-10-09 (2 sessions away)');
    const c = buildResearchSnapshot({ canonical: canonical({ symbol: 'BTC', assetClass: 'crypto', options: null, fundamentals: null, network: {} }), priceEvidence: pe(), timingEvidence: { ...te, earnings: null } });
    expect(c.sections.find((x) => x.id === 'options')!.status).toBe('not applicable');
    expect(c.summary.join(' ')).not.toContain('Options data');
    expect(c.dates.map((d) => d.id)).not.toContain('options');
  });
  it('states a recorded or watched release in words', () => {
    expect(buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), volatilityRelease: { type: 'compression_release_up', state: 'fired' } }).summary.join(' ')).toContain('A volatility release was recorded (upward).');
    expect(buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), volatilityRelease: { type: 'compression_release_up', state: 'armed' } }).summary.join(' ')).toContain('has not been met');
  });
  it('renders summary, dated observations, section status and specialist links', () => {
    const s = buildResearchSnapshot({ canonical: canonical(), priceEvidence: pe(), timingEvidence: te });
    const { container } = render(<ResearchSnapshotCard s={s} links={[{ href: '/tools/options?symbol=AAPL', label: 'Options' }]} />);
    expect(container.querySelector('[data-snapshot-summary]')!.textContent).toContain('AAPL is above');
    expect(container.querySelectorAll('[data-observation-date]')).toHaveLength(5);
    expect(container.querySelector('[data-observation-date="quote"]')!.textContent).toContain('2026-10-07 10:35 UTC');
    expect(container.querySelectorAll('[data-section-status]')).toHaveLength(5);
    expect(container.querySelector('a[href="/tools/options?symbol=AAPL"]')).not.toBeNull();
  });
  it('sits above the other Symbol sections, with the folds in research order', () => {
    const src = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    const at = (t: string) => { const i = src.indexOf(t); expect(i, t).toBeGreaterThan(-1); return i; };
    expect(at('<ResearchSnapshotCard')).toBeLessThan(at('<EquityTop'));
    const order = ['<PriceEvidencePanel', 'title="Options"', '<TimingEvidencePanel', 'title="Fundamentals"', 'title="Recorded levels"'];
    const idx = order.map((t) => src.indexOf(t, src.indexOf('<EquityTop')));
    idx.forEach((i, n) => expect(i, order[n]).toBeGreaterThan(-1));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
