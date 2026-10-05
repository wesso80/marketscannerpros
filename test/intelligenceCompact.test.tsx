// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewsIntelligenceCompact, { type NewsIntelligenceCompactProps } from '@/components/research/NewsIntelligenceCompact';
import CalendarIntelligenceCompact, { type CalendarIntelligenceCompactProps } from '@/components/research/CalendarIntelligenceCompact';

const articles = Array.from({ length: 8 }, (_, index) => ({
  id: `a${index}`,
  title: `Published observation ${index + 1}`,
  url: `https://example.invalid/news/${index}`,
  summary: 'Recorded publication context for this research item.',
  source: 'Research wire',
  timePublished: '20261005T130000',
  sentiment: 'Somewhat-Bullish',
  impact: 'MEDIUM',
  tags: ['Macro'],
  narrative: 'Macro Repricing',
}));

function newsProps(overrides: Partial<NewsIntelligenceCompactProps> = {}): NewsIntelligenceCompactProps {
  return {
    loading: false,
    error: '',
    articles,
    gate: {
      topNarrative: 'Macro Repricing',
      riskState: 'Neutral',
      volRegime: 'Compression',
      catalystDensity: 'Low',
      narrativeStrength: 'Mixed',
      sentimentPct: 50,
      confidencePct: 40,
      rotationLeaders: ['Macro Repricing'],
      warnings: [],
      eventRiskLabel: 'No major macro event',
      eventRiskCountdown: 'Not collected',
      briefLines: ['Leading narratives show the most consistent coverage.'],
      weakLines: [],
      permission: 'YES',
    },
    narratives: [{ name: 'Macro Repricing', count: 8 }],
    brief: null,
    tickers: 'AAPL',
    onTickers: vi.fn(),
    query: '',
    onQuery: vi.fn(),
    bucket: 'ALL',
    onBucket: vi.fn(),
    sort: 'MOST_RELEVANT',
    onSort: vi.fn(),
    hideLowQuality: true,
    onHideLowQuality: vi.fn(),
    groupByNarrative: true,
    onGroupByNarrative: vi.fn(),
    onSearch: vi.fn(),
    earnings: {
      loading: false,
      error: '',
      rows: [],
      symbol: '',
      horizon: '3month',
      scope: 'all',
      session: 'all',
      highImpactOnly: false,
      sort: 'impact',
      onSymbol: vi.fn(),
      onHorizon: vi.fn(),
      onScope: vi.fn(),
      onSession: vi.fn(),
      onHighImpactOnly: vi.fn(),
      onSort: vi.fn(),
      onSearch: vi.fn(),
      insight: null,
    },
    ...overrides,
  };
}

const now = Date.parse('2026-10-05T13:00:00Z');
const events = Array.from({ length: 8 }, (_, index) => ({
  id: `e${index}`,
  name: `Release ${index + 1}`,
  country: 'United States',
  countryCode: 'US' as const,
  impact: 'high',
  releaseMs: now + (index + 1) * 3_600_000,
  when: '09:00 America/New_York',
  actual: '--',
  forecast: '1.20%',
  previous: '1.10%',
  status: 'UNCONFIRMED',
  timing: 'CONFIRMED',
  sourceUrl: null,
}));

function calendarProps(overrides: Partial<CalendarIntelligenceCompactProps> = {}): CalendarIntelligenceCompactProps {
  return {
    loading: false,
    error: null,
    events,
    nowMs: now,
    countdown: '2d 0h',
    nextEventName: 'CPI',
    reviewState: 'CAUTION',
    reason: 'Catalyst density is elevated.',
    riskState: 'Neutral',
    volRegime: 'Expansion',
    liquidity: 'Thin',
    density: 'Medium',
    researchMode: 'Mean-reversion review',
    dangerWindow: 'T-30 → T+30',
    warnings: [],
    days: 30,
    onDays: vi.fn(),
    onRefresh: vi.fn(),
    impact: 'all',
    onImpact: vi.fn(),
    hideLowImpact: true,
    onHideLowImpact: vi.fn(),
    timeMode: 'user',
    onTimeMode: vi.fn(),
    userTz: 'Australia/Sydney',
    country: 'GLOBAL',
    onCountry: vi.fn(),
    categories: [],
    onToggleCategory: vi.fn(),
    focusAssets: ['SPX', 'NQ', 'USD'],
    onToggleFocus: vi.fn(),
    japan: null,
    sourceLabel: 'Curated economic schedule',
    sourceAsOf: '2026-10-05T13:00:00Z',
    sourceBasis: 'Curated dates · live releases not configured · scheduled releases',
    statusCounts: { LIVE: 0, DELAYED: 0, STALE: 0, MISSING: 1, UNCONFIRMED: 7 },
    ...overrides,
  };
}

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('caps news intelligence at five articles with one verdict and one source', () => {
  const props = newsProps();
  const { container } = render(<NewsIntelligenceCompact {...props} />);
  expect(container.querySelectorAll('[data-news-intel-article]')).toHaveLength(5);
  expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(screen.getByRole('status').textContent).toContain('8 articles in view');
  expect(container.textContent).not.toContain('Somewhat-Bullish');
  fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }));
  expect(container.querySelectorAll('[data-news-intel-article]')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Find news evidence' }));
  expect(props.onSearch).toHaveBeenCalledOnce();
});

it('keeps a failed news scan free of a source line and raw error text', () => {
  const { container } = render(<NewsIntelligenceCompact {...newsProps({ loading: false, error: 'PROVIDER_DOWN', articles: [] })} />);
  expect(screen.getByRole('status').textContent).toBe('News intelligence could not be loaded');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
  expect(container.textContent).not.toContain('PROVIDER_DOWN');
});

it('caps calendar intelligence at the next five and keeps earlier rows behind show all', () => {
  const mixed = [
    { ...events[0], id: 'past', name: 'Earlier print', releaseMs: now - 3_600_000 },
    ...events,
  ];
  const { container } = render(<CalendarIntelligenceCompact {...calendarProps({ events: mixed })} />);
  expect(container.querySelectorAll('[data-calendar-intel-event]')).toHaveLength(5);
  expect(container.textContent).not.toContain('Earlier print');
  expect(screen.getByRole('status').textContent).toBe('2d 0h · CPI');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(container.textContent).not.toContain('MISSING');
  fireEvent.click(screen.getByRole('button', { name: 'Show all 9' }));
  expect(container.querySelectorAll('[data-calendar-intel-event]')).toHaveLength(9);
  expect(screen.getByText('Earlier print')).toBeTruthy();
});

it('states an empty calendar filter without inventing a countdown', () => {
  const { container } = render(<CalendarIntelligenceCompact {...calendarProps({ events: [], nextEventName: null, error: null })} />);
  expect(screen.getByRole('status').textContent).toBe('No events match this filter');
  expect(container.querySelectorAll('[data-calendar-intel-event]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});

it('embeds the compact news view and leaves the standalone workstation in place', async () => {
  vi.resetModules();
  vi.doMock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/tools/news' }));
  vi.doMock('@/lib/useUserTier', () => ({
    useUserTier: () => ({ tier: 'pro', isAdmin: false, isLoggedIn: true, isLoading: false }),
    canAccessPortfolioInsights: () => true,
  }));
  const body = JSON.stringify({
    success: true,
    articles: Array.from({ length: 8 }, (_, index) => ({
      title: `Published observation ${index + 1}`,
      url: `https://example.invalid/news/${index}`,
      timePublished: '20261005T130000',
      summary: 'Recorded publication context for this research item. '.repeat(12),
      source: 'Research wire',
      sentiment: { label: 'Somewhat-Bullish', score: 0.2 },
      tickerSentiments: [{ ticker: 'AAPL', relevance: 0.8, sentimentScore: 0.2, sentimentLabel: 'Bullish' }],
      aiWhyMatters: 'Coverage context for the compact view.',
    })),
    tickerSummaries: [],
    aiAnalysis: null,
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/economic-calendar')) return { ok: true, json: async () => ({ events: [] }) };
    return { ok: true, json: async () => JSON.parse(body) };
  }));
  const { default: News } = await import('@/app/tools/news/page');
  const { container } = render(<News embeddedInResearch />);
  await waitFor(() => expect(container.querySelectorAll('[data-news-intel-article]')).toHaveLength(5));
  expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  cleanup();
  const standalone = render(<News />);
  expect(standalone.getByRole('button', { name: 'News & Sentiment' })).toBeTruthy();
  expect(standalone.container.textContent).toMatch(/Find News Evidence|Scanning/);
  expect(standalone.container.querySelectorAll('[data-news-intel-article]')).toHaveLength(0);
});
