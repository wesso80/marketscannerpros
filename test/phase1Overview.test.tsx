// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import PageHero from '@/components/ui/PageHero';

describe('Symbol header hierarchy', () => {
  it('retains h1 by default and accepts h2', () => {
    expect(renderToStaticMarkup(<PageHero eyebrow="Test" title="Title" />)).toContain('<h1');
    expect(renderToStaticMarkup(<PageHero eyebrow="Test" title="Title" titleAs="h2" />)).not.toContain('<h1');
  });
  it('removes header composite displays but retains the lower evidence block', () => {
    const source = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    const header = source.slice(source.indexOf('      <PageHero'), source.indexOf('      <section', source.indexOf('      <PageHero')));
    expect(header).toContain('titleAs="h2"');
    expect(header).not.toMatch(/Indicator composite|INDICATOR_COMPOSITE_LABEL|geConfluenceScore/);
    expect(source.slice(source.indexOf(header) + header.length)).toContain('INDICATOR_COMPOSITE_LABEL');
    expect(source).toContain('CANONICAL_SETUP_TOOLTIP');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import RadarReportCard from '@/components/overview/RadarReportCard';
import TodayStrip from '@/components/overview/TodayStrip';
import DataStatusRow from '@/components/overview/DataStatusRow';
import { rankSectorStrength } from '@/lib/analysis/commandCenter';
import { COPY } from '@/components/visual/copy';
const tier = vi.hoisted(() => ({ tier: 'pro', isAdmin: false, isLoading: false, isLoggedIn: true }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => tier }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
let root: Root, container: HTMLDivElement;
const payload = { sessionDate: '2026-10-02', status: 'COMPLETE', healthStatus: 'NORMAL', generatedAt: '2026-10-02T21:05:00Z', headline: 'SECRET HEADLINE', ops: { runId: 'PRIVATE_RUN', emailStatus: 'PRIVATE_EMAIL' }, report: { candidates: Array(12).fill({ symbol: 'AAPL', setupType: 'EARLY', score: 987654 }) } };
const fetcher = vi.fn();
beforeEach(() => {
  Object.assign(tier, { tier: 'pro', isAdmin: false, isLoading: false, isLoggedIn: true });
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (element: React.ReactNode) => { await act(async () => { root.render(element); }); };
describe('Radar access and response states', () => {
  it.each(['free', 'anonymous'])('%s has no request and no paid data', async value => {
    tier.tier = value; tier.isLoggedIn = value !== 'anonymous';
    await render(<RadarReportCard />);
    expect(fetcher).not.toHaveBeenCalled(); expect(container.textContent).toContain('Paid plan');
    expect(container.innerHTML).not.toMatch(/12 candidates|987654|2026|SECRET|PRIVATE/);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(tier.isLoggedIn ? '/pricing' : '/auth?next=/tools/msp-radar');
  });
  it('waits for tier hydration before fetching', async () => {
    tier.isLoading = true; await render(<RadarReportCard />); expect(fetcher).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(COPY.radarCard.loading);
    tier.isLoading = false; await render(<RadarReportCard />); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['pro', 'pro_trader', 'admin'])('%s fetches once and renders only the projected fields', async value => {
    tier.tier = value === 'admin' ? 'free' : value; tier.isAdmin = value === 'admin';
    await render(<RadarReportCard />);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/msp-radar/daily?view=card', expect.objectContaining({ cache: 'no-store', credentials: 'include', signal: expect.any(AbortSignal) }));
    expect(container.textContent).toMatch(/Fri 2 Oct/); expect(container.textContent).toContain('12 candidates'); expect(container.textContent).toContain('COMPLETE');
    expect(container.innerHTML).not.toMatch(/SECRET|PRIVATE|987654|NORMAL/);
    await render(<RadarReportCard />); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('hides count for FAILED and shows older date without changing it', async () => {
    fetcher.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...payload, status: 'FAILED', healthStatus: 'FAILED', sessionDate: '2020-10-01' }) });
    await render(<RadarReportCard />); expect(container.textContent).toContain('FAILED'); expect(container.textContent).toContain('Older report'); expect(container.textContent).not.toContain('candidates');
  });
  it.each([401, 403])('honors server denial %s without showing report fields', async status => {
    fetcher.mockResolvedValue({ ok: false, status }); await render(<RadarReportCard />);
    expect(container.textContent).toContain('Paid plan'); expect(container.textContent).not.toContain('12 candidates');
  });
  it('404 is empty, not zero candidates', async () => {
    fetcher.mockResolvedValue({ ok: false, status: 404 }); await render(<RadarReportCard />);
    expect(container.textContent).toContain('No report stored yet.'); expect(container.textContent).not.toContain('candidates');
  });
  it.each([500, 502])('%s has an explicit error and no fake count', async status => {
    fetcher.mockResolvedValue({ ok: false, status }); await render(<RadarReportCard />);
    expect(container.textContent).toContain(`HTTP ${status}`); expect(container.textContent).toContain('Report unavailable');
  });
  it('network failure has safe error text', async () => {
    fetcher.mockRejectedValue(new Error('SECRET bearer token')); await render(<RadarReportCard />);
    expect(container.textContent).toContain('Network request failed.'); expect(container.textContent).not.toContain('SECRET');
  });
  it('aborts on unmount and never displays a late paid response after access is removed', async () => {
    let resolve!: (value: unknown) => void;
    fetcher.mockImplementation(() => new Promise(done => { resolve = done; }));
    await render(<RadarReportCard />); const signal = fetcher.mock.calls[0][1].signal;
    tier.tier = 'free'; await render(<RadarReportCard />); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ok: true, status: 200, json: async () => payload }));
    expect(container.textContent).toContain('Paid plan'); expect(container.textContent).not.toContain('12 candidates');
  });
});
describe('Today data presentation', () => {
  const sectors = ['XLK', 'XLC', 'XLY', 'XLF', 'XLI', 'XLB', 'XLE', 'XLV', 'XLP', 'XLRE', 'XLU'].map((symbol, i) => ({ symbol, name: symbol, changePercent: i === 0 ? null : i - 5 }));
  const props = { regime: { regimeLabel: 'Trending — risk-on', available: true, stale: false, asOf: '2026-10-02T20:00:00Z' }, loading: false, hasRegimeData: true, regimeColor: 'var(--msp-bull)', sectors, sectorDay: '2026-10-02', strength: rankSectorStrength(sectors), quotes: { BTC: { price: 84859, observedAt: '2026-10-04T02:00:00Z', source: 'stored quote' }, ETH: { price: 2659, observedAt: '2026-10-04T02:00:00Z', source: 'stored quote' }, SPY: { price: 0, latestDay: '2026-10-02', source: 'stored quote' } } };
  it('renders 11 sorted cells, an accessible text equivalent, and zero SPY as no quote', async () => {
    await render(<TodayStrip {...props} />);
    const cells = [...container.querySelectorAll('[data-sector-cell]')];
    expect(cells).toHaveLength(11); expect(cells[0].getAttribute('data-sector-cell')).toBe('XLU'); expect(cells[10].textContent).toContain('No reading');
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('XLK No reading');
    expect(container.textContent).toContain('no quote'); expect(container.textContent).not.toContain('$0.00');
    for (const card of container.querySelectorAll('[data-stat-card], figure')) expect(card.querySelector('[data-stamp-line]')).not.toBeNull();
    expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(4);
    expect(container.textContent).toContain('5 / 10'); // Missing sector excluded by the existing strength model.
  });
  it.each([
    [true, false, false, false, 'Loading'], [false, false, false, false, 'Not available right now'],
    [false, true, true, true, 'Stale inputs'], [false, true, true, false, 'Current'],
  ])('uses the existing regime freshness precedence', async (loading, hasRegimeData, available, stale, expected) => {
    await render(<TodayStrip {...props} loading={loading} hasRegimeData={hasRegimeData} regime={{ ...props.regime, available, stale }} />);
    expect(container.querySelector('[aria-label="Overview"]')?.textContent).toContain(expected);
  });
  it('folds the same eight status items into a closed disclosure', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ label: `Feed ${i}`, statusLabel: i === 0 ? 'Degraded' : i < 3 ? 'Stale' : 'Unknown', notes: i < 3 ? ['12:00 UTC Fri 2 Oct'] : ['time unknown'] }));
    await render(<DataStatusRow items={items} />);
    expect(container.querySelector('details')?.open).toBe(false);
    expect(container.querySelector('summary')?.textContent).toContain('1 needs a check · 2 stale · 5 not timed');
    expect(container.querySelector('summary')?.textContent).toContain('Show');
    expect(container.textContent).toContain('Feed 0 · Some data is older');
    expect(container.textContent).toContain('Feed 3 · Not available right now');
  });
});
