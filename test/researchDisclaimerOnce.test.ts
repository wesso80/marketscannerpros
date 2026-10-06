// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import NewsIntelligenceCompact from '@/components/research/NewsIntelligenceCompact';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ tab: 'intelligence' }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoggedIn: true, isLoading: false, isAdmin: false }) }));
vi.mock('@/app/v2/_lib/V2Context', () => ({ useV2: () => ({ navigateTo: vi.fn(), selectSymbol: vi.fn() }) }));
vi.mock('@/app/v2/_lib/api', () => ({
  useNews: () => ({ data: null, loading: false }),
  useEconomicCalendar: () => ({ data: null, loading: false }),
  useEarningsCalendar: () => ({ data: null, loading: false }),
}));

import Research from '@/app/tools/research/page';

const FULL_COMPACT = 'This page displays analytical information and scenario modelling only.';

function embeddedNews() {
  const noop = () => {};
  return React.createElement(NewsIntelligenceCompact, {
    loading: false,
    error: '',
    articles: [],
    gate: {
      topNarrative: 'Not collected',
      riskState: 'Neutral',
      volRegime: 'Compression',
      catalystDensity: 'Low',
      narrativeStrength: 'Mixed',
      sentimentPct: 0,
      confidencePct: 0,
      rotationLeaders: [],
      warnings: [],
      eventRiskLabel: 'No major macro event',
      eventRiskCountdown: 'Not collected',
      briefLines: [],
      weakLines: [],
      permission: 'YES',
    },
    narratives: [],
    brief: null,
    tickers: '',
    onTickers: noop,
    query: '',
    onQuery: noop,
    bucket: 'ALL',
    onBucket: noop,
    sort: 'MOST_RELEVANT',
    onSort: noop,
    hideLowQuality: true,
    onHideLowQuality: noop,
    groupByNarrative: false,
    onGroupByNarrative: noop,
    onSearch: noop,
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
      onSymbol: noop,
      onHorizon: noop,
      onScope: noop,
      onSession: noop,
      onHighImpactOnly: noop,
      onSort: noop,
      onSearch: noop,
      insight: null,
    },
  });
}

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows exactly one full compact disclaimer on the News Intelligence tab', () => {
  const research = readFileSync('app/tools/research/page.tsx', 'utf8');
  const compact = readFileSync('components/research/NewsIntelligenceCompact.tsx', 'utf8');
  const layout = readFileSync('app/tools/ToolsLayoutClient.tsx', 'utf8');
  expect(layout).toContain("'/tools/research'");
  expect(layout).toContain('<ComplianceDisclaimer collapsible />');
  expect(research.match(/<ComplianceDisclaimer compact \/>/g)).toHaveLength(1);
  expect(research).not.toContain("tab !== 'News Intelligence' && <ComplianceDisclaimer");
  expect(compact).not.toContain('ComplianceDisclaimer');
  expect(readFileSync('app/tools/news/page.tsx', 'utf8').match(/<ComplianceDisclaimer compact \/>/g)?.length).toBe(2);

  const { container } = render(React.createElement(React.Fragment, null, React.createElement(Research), embeddedNews()));
  expect((container.textContent?.split(FULL_COMPACT).length ?? 1) - 1).toBe(1);
});
