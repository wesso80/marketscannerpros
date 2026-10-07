// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildSymbolNews } from '@/lib/research/newsEvidence';
import SymbolNewsPanel from '@/components/research/SymbolNewsPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const art = (title: string, t: string, source: string) => ({
  title, summary: `Apple Inc ${title}`, source, url: `https://example.com/${encodeURIComponent(title)}`, time_published: t,
  ticker_sentiment: [{ ticker: 'AAPL', relevance_score: '0.8', ticker_sentiment_label: 'Somewhat-Bullish', ticker_sentiment_score: '0.3' }],
});
const feed = [
  art('Apple beats quarterly revenue estimates on iPhone demand', '20261006T120000', 'Reuters'),
  art('Apple beats quarterly revenue estimates on strong iPhone demand', '20261006T130000', 'Bloomberg'),
  art('Apple faces EU antitrust probe over App Store fees', '20261003T090000', 'FT'),
];

describe('symbol news shared by Symbol and Deep Analysis', () => {
  it('groups reports of one event and counts events', () => {
    const n = buildSymbolNews('AAPL', 'equity', { feed, status: 'available', fetchedAt: '2026-10-07T10:00:00Z' }, 'Apple Inc');
    expect(n.status).toBe('available');
    expect(n.considered).toBe(3);
    expect(n.counts.articles).toBe(3);
    expect(n.counts.events).toBe(2);
    const big = n.events.find((e) => e.articles === 2)!;
    expect(big.sources.sort()).toEqual(['Bloomberg', 'Reuters']);
  });
  it('a provider failure is reported as unavailable, not as "no news"', () => {
    const n = buildSymbolNews('AAPL', 'equity', { feed: [], status: 'unavailable', fetchedAt: '2026-10-07T10:00:00Z', reason: 'Provider quota or rate limit reached' }, 'Apple Inc');
    expect(n.status).toBe('unavailable');
    expect(n.headline).toBe('News unavailable: Provider quota or rate limit reached.');
    expect(n.headline).not.toMatch(/No material/);
  });
  it('renders one row per event with article count, sources and the counting rule', async () => {
    const news = buildSymbolNews('AAPL', 'equity', { feed, status: 'available', fetchedAt: '2026-10-07T10:00:00Z' }, 'Apple Inc');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, news }) }));
    const { container } = render(<SymbolNewsPanel symbol="AAPL" type="equity" />);
    await screen.findByText(/articles about 2 events/);
    expect(container.querySelectorAll('[data-news-event]')).toHaveLength(2);
    expect(container.textContent).toContain('2 articles on this event');
    expect(container.textContent).toContain('count once');
    expect(container.textContent).toContain('fetched 2026-10-07 10:00 UTC');
    expect(container.textContent).not.toMatch(/\b(buy|sell|likely|probability)\b/i);
  });
  it('shows an error instead of an empty list when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Pro access required' }) }));
    render(<SymbolNewsPanel symbol="AAPL" type="equity" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Pro access required');
  });
  it('the route is paid-gated and both views use the shared module', () => {
    const route = readFileSync('app/api/research/news/route.ts', 'utf8');
    expect(route).toContain('hasPaidSessionAccess(session)');
    expect(route).toContain('buildSymbolNews(symbol, assetClass, feed, companyName)');
    expect(readFileSync('app/api/deep-analysis/route.ts', 'utf8')).toContain('fetchSymbolNewsFeed(symbol, assetClass)');
    const page = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    expect(page).toContain('<SymbolNewsPanel symbol={sym} type="equity"/>');
    expect(page).toContain('<SymbolNewsPanel symbol={sym} type="crypto"/>');
    expect(page.indexOf('title="News and ownership"')).toBeGreaterThan(page.indexOf('title="Fundamentals"'));
  });
});
