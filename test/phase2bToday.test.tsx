// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newsArticles = vi.hoisted(() => Array.from({ length: 5 }, (_, i) => ({
  title: `Headline ${i}`, url: `https://example.test/${i}`, source: 'Example', sentiment: { score: 0, label: 'Flat' }, tickerSentiments: [],
})));
const nav = vi.hoisted(() => ({ tab: '', replace: vi.fn() }));
const tierState = vi.hoisted(() => ({ tier: 'pro', isAdmin: false, isLoading: false, isLoggedIn: true }));

vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'tab' ? nav.tab : null) }),
  usePathname: () => '/tools/dashboard',
}));
vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => tierState,
  canAccessPortfolioInsights: (tier: string) => tier === 'pro' || tier === 'pro_trader' || tier === 'admin',
}));
vi.mock('@/hooks/useRankedQueue', () => ({
  useRankedQueue: () => ({ rows: [], equity: [], crypto: [], loading: false, error: null, qualityWarnings: [], stale: false, ageMinutes: null, localDemo: false, regime: 'RANGE_NEUTRAL', refetch: () => {} }),
}));
vi.mock('@/app/v2/_lib/V2Context', () => ({ useV2: () => ({ navigateTo: () => {}, selectSymbol: () => {} }) }));
vi.mock('@/hooks/usePublicMarketFeed', () => ({ usePublicMarketFeed: () => ({ url: '', data: null, loading: false, error: null }) }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: () => {} }) }));
vi.mock('@/components/MarketStatusBadge', () => ({ default: () => null }));
vi.mock('@/app/v2/_lib/api', () => ({
  useRegime: () => ({ data: null, loading: false, error: null }),
  useSectorsHeatmap: () => ({ data: { sectors: [] }, loading: false }),
  useCryptoOverview: () => ({ data: null, loading: false }),
  useMarketMovers: () => ({ data: { topGainers: [], topLosers: [], mostActive: [] }, loading: false }),
  useEconomicCalendar: () => ({ data: { events: [] }, loading: false }),
  useNews: () => ({ data: { articles: newsArticles }, loading: false, error: null }),
  useDailyPicksBundle: () => ({ data: null, loading: false, error: null, isAuthError: false, isUpgradeRequired: false, refetch: () => {} }),
}));

import CommandCenterPage from '@/app/tools/command-center/page';
import DashboardPage from '@/app/tools/dashboard/page';
import MacroDashboardPage from '@/components/macro/MacroDashboard';
import MarketMoversPage from '@/app/tools/market-movers/page';
import MspRadarReport from '@/components/msp-radar/MspRadarReport';
import RadarReportCard from '@/components/overview/RadarReportCard';

const BANNED = /HISTORICAL_OPTIONS|\bUNKNOWN\b|Awaiting data|\bUnavailable\b|\bN\/A\b|\bMISSING\b|\bDEGRADED\b|time unknown|source unknown|\$0\.00|0\.00x/;
const indicator = (value: number) => ({ value, date: '2026-10-01', history: [{ date: '2026-10-01', value }] });
const macroPayload = {
  timestamp: new Date().toISOString(),
  rates: {
    treasury2y: indicator(4), treasury10y: indicator(4.2), fedFunds: indicator(4.5),
    yieldCurve: { value: 0.2, inverted: false, label: 'positive' },
    yieldCurve3m10y: { value: 0.1, inverted: false, label: 'positive' },
  },
  inflation: { cpi: indicator(300), inflationRate: indicator(2.5), trend: 'stable' },
  employment: { unemployment: indicator(4.1), trend: 'flat' },
  growth: { realGDP: { value: 28000, unit: 'billions', history: [] } },
  regime: { label: 'Mixed', description: 'Measured mix', riskLevel: 'medium' as const },
};
const emptyReport = {
  version: 1, sessionDate: '2026-10-02', generatedAt: '2026-10-02T21:00:00Z', headline: 'Quiet session', status: 'COMPLETE',
  health: { status: 'NORMAL', summary: 'ok', stage2CoveragePct: 100, shortlistMayBeIncomplete: false, checks: [] },
  marketIn30Seconds: [{ label: 'Breadth', value: 'flat' }],
  whatMoved: { equities: { strength: [], weakness: [], unusualVolume: [], gaps: [], breakouts: [], breakdowns: [], breadth: 'flat' }, crypto: { movers: [], unusual: [], altBreadth: 'flat' }, crossAsset: [] },
  candidates: [{ rank: 1, symbol: 'AAPL', name: 'Apple', assetClass: 'equity', setupType: 'EARLY', score: 10, extension: 'EARLY', ret1: 1.2, ret5: null, velocity: 'steady', whySurfaced: 'Measured session change.', caveat: '', catalyst: '', lifecycle: null }],
  whatMayMoveNext: [], lifecycle: { counts: {}, transitions: [], highlights: [], source: 'jarvis_watchlist' },
  themes: { equity: { leading: [], improving: [], deteriorating: [], groups: [] }, crypto: { context: 'flat', groups: [] } },
  rejected: [], lookAtFirst: [], probablyNoise: [],
  dataHealth: { universe: 1, equities: 1, crypto: 0, etfs: 0, stage1Listed: 1, stage1Quoted: 1, liquid: 1, stage2Selected: 1, stage2Live: 1, stage2Fallback: 0, stage2Missing: 0, coveragePct: 100, deepDives: 0, alphaVantageCalls: 0, coingeckoCalls: 0, dbQueries: 0, providerErrors: 0, runtimeMs: 1, peakRssMb: null, sectorCacheCoverage: null, providers: [], gaps: [] },
  disclaimer: 'Educational research only.',
};

let root: Root;
let container: HTMLDivElement;
const fetcher = vi.fn();
beforeEach(() => {
  Object.assign(tierState, { tier: 'pro', isAdmin: false, isLoading: false, isLoggedIn: true });
  nav.tab = ''; nav.replace.mockReset();
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset().mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/economic-indicators')) return { ok: true, status: 200, json: async () => macroPayload };
    if (path.includes('/api/msp-radar/daily')) return { ok: true, status: 200, json: async () => ({ sessionDate: '2020-01-02', status: 'COMPLETE', healthStatus: 'NORMAL', generatedAt: '2020-01-02T21:00:00Z', reportVersion: 1, headline: 'Quiet', report: emptyReport, nav: { previous: null, next: null } }) };
    if (path.includes('/api/msp-radar/archive')) return { ok: true, status: 200, json: async () => ({ items: [] }) };
    if (path.includes('/api/market-movers')) return { ok: true, status: 200, json: async () => ({ topGainers: [], topLosers: [], mostActive: [], equityFeed: 'realtime', equityAsOf: '2026-10-02T20:00:00Z', lastUpdated: '2026-10-02T20:00:00Z' }) };
    if (path.includes('/api/correlation-regime')) return { ok: true, status: 200, json: async () => ({ available: false, reason: 'Not available right now' }) };
    return { ok: true, status: 200, json: async () => ({ quotes: [], commodities: [], contracts: [] }) };
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { window.history.replaceState(null, '', '/'); act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (element: React.ReactNode) => { await act(async () => { root.render(element); }); await act(async () => { await Promise.resolve(); }); };

describe('Phase 2B today pages', () => {
  it('Overview has one regime box, folded blocks closed, and three headlines', async () => {
    await render(<CommandCenterPage />);
    expect(container.querySelectorAll('[data-regime-box]')).toHaveLength(1);
    const folds = [...container.querySelectorAll('[data-desk-folds] details')];
    expect(folds.length).toBeGreaterThan(0);
    expect(folds.every((node) => !(node as HTMLDetailsElement).open)).toBe(true);
    expect(container.textContent).toContain('Headline 0');
    expect(container.textContent).toContain('Headline 2');
    expect(container.textContent).not.toContain('Headline 3');
    expect(container.textContent).not.toMatch(BANNED);
  });

  it('Dashboard has no command tab and ?tab=command opens Overview', async () => {
    await render(<DashboardPage />);
    expect(container.textContent).toContain('My Pages');
    expect(container.textContent).toContain('Macro');
    expect(container.textContent).not.toMatch(/Command Center/);
    nav.tab = 'command';
    await render(<DashboardPage />);
    expect(container.textContent).toContain('Opening Overview');
    expect(nav.replace).toHaveBeenCalledWith('/tools/command-center');
  });

  it('redirects ?tab=crypto to Crypto Derivatives', async () => {
    nav.tab = 'crypto';
    await render(<DashboardPage />);
    expect(container.textContent).toContain('Opening Crypto Derivatives');
    expect(nav.replace).toHaveBeenCalledWith('/tools/crypto-dashboard');
  });

  it('Macro render starts with Global regime', async () => {
    await render(<MacroDashboardPage embeddedInDashboard />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const lead = container.querySelector('[data-global-regime]');
    expect(lead?.querySelector('h2')?.textContent).toBe('Global regime');
    expect(lead?.querySelector('[data-verdict-box]')).not.toBeNull();
    expect(lead?.querySelectorAll('[data-macro-tile]')).toHaveLength(4);
    expect(container.innerHTML.indexOf('data-global-regime')).toBeLessThan(container.innerHTML.indexOf('Decision detail'));
    expect(container.querySelector('[data-global-regime] details')).toBeNull();
    expect(container.querySelector('[aria-label="Macro command header"]')).toBeNull();
    expect(container.textContent).not.toContain('Yield curve chart is the next row');
    const decision = container.querySelector('#decision')?.closest('details') as HTMLDetailsElement | null;
    expect(decision?.open).toBe(false);
    const link = container.querySelector('a[href="#decision"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    await act(async () => { link!.click(); });
    expect(decision?.open).toBe(true);
  });

  it('opens a Macro fold when the page loads with its hash', async () => {
    window.history.replaceState(null, '', '#rates');
    await render(<MacroDashboardPage embeddedInDashboard />);
    await vi.waitFor(() => expect(container.querySelector('#rates')).not.toBeNull());
    expect(window.location.hash).toBe('#rates');
    expect((container.querySelector('#rates')?.closest('details') as HTMLDetailsElement).open).toBe(true);
    window.history.replaceState(null, '', '/');
  });

  it('Macro inside Dashboard starts at Global regime', async () => {
    nav.tab = 'macro';
    await render(<DashboardPage />);
    await vi.waitFor(() => expect(container.querySelector('[data-global-regime] h2')?.textContent).toBe('Global regime'));
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('[aria-label="Dashboard lens"]')).toBeNull();
    expect(container.querySelector('[aria-label="Macro command header"]')).toBeNull();
    expect(container.textContent).not.toContain('Yield curve chart is the next row');
  });

  it('Radar and Movers empty fixtures avoid raw status words', async () => {
    root.render(<MspRadarReport />);
    await vi.waitFor(() => expect(container.querySelector('[data-radar-visual]')).not.toBeNull());
    expect(container.querySelector('h1')?.textContent).toBe('Daily Radar');
    expect(container.textContent).not.toMatch(BANNED);
    root.render(<MarketMoversPage />);
    await vi.waitFor(() => expect(container.querySelectorAll('[data-mover-bars]')).toHaveLength(2));
    expect(container.querySelectorAll('[data-mover-bars]')).toHaveLength(2);
    expect(container.textContent).toContain('Show all');
    expect(container.textContent).not.toMatch(BANNED);
  });

  it('Radar card title follows the Older report tag', async () => {
    fetcher.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sessionDate: '2020-01-02', status: 'COMPLETE', healthStatus: 'NORMAL', generatedAt: '2020-01-02T21:00:00Z', candidateCount: 4, report: { candidates: [{ symbol: 'AAPL', setupType: 'EARLY' }] } }) });
    await render(<RadarReportCard />);
    expect(container.querySelector('h2')?.textContent).toBe('Older report');
    expect(container.textContent).toContain('Older report');
    expect(container.textContent).toContain('AAPL');
    expect(fetcher).toHaveBeenCalledWith('/api/msp-radar/daily?view=card', expect.objectContaining({ cache: 'no-store' }));
  });
});
