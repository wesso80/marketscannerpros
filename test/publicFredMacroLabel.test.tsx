// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createRequire } from 'node:module';

const fixtures = createRequire(import.meta.url)('../docs/qa/macro-2026-10-05/fixtures.cjs');
const state = vi.hoisted(() => ({ tier: 'pro' as string }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: state.tier, isAdmin: false, isLoading: false }) }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: vi.fn() }) }));
vi.mock('@/components/MarketStatusBadge', () => ({ default: () => null }));

import Macro from '@/components/macro/MacroDashboard';
import MacroResearch from '@/components/public-design/MacroResearch';

const obs = { value: 4.2, date: '2026-10-02' };
const reading: any = {
  timestamp: '2026-10-05T13:00:00Z',
  asOf: '2026-09-24',
  rates: { treasury3m: obs, treasury2y: obs, treasury5y: obs, treasury10y: obs, treasury30y: obs, fedFunds: obs },
  inflation: { inflationRate: { value: 3.1, date: '2026-08-01' } },
  employment: { unemployment: obs },
  growth: { realGDP: { value: 23000, unit: 'billions USD' } },
};

beforeEach(() => {
  state.tier = 'pro';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(String(url), 'https://fixture.invalid').pathname;
    return { ok: true, status: 200, json: async () => structuredClone(fixtures[path] || {}) };
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the FRED source and observation date on the macro page', async () => {
  render(<MacroResearch data={reading} paid loading={false} error={false} retry={() => {}} />);
  expect(screen.getByText('Source: FRED (Federal Reserve Bank of St. Louis). As of 2026-09-24.')).toBeTruthy();
  expect(screen.queryByText(/existing economic-indicators feed/)).toBeNull();
  expect(screen.queryByText(/Response assembled/)).toBeNull();
  expect(document.body.textContent).not.toContain('2026-10-05T13:00:00Z');
});

it('renders the FRED label from the macro page fetch', async () => {
  render(<Macro />);
  expect(await screen.findByText('Source: FRED (Federal Reserve Bank of St. Louis). As of 2026-10-02.')).toBeTruthy();
  expect(screen.queryByText(/existing economic-indicators feed/)).toBeNull();
  expect(document.body.textContent).not.toContain('2026-10-05T13:00:00Z');
});

it('renders the FRED label and as-of date on the embedded macro readings', async () => {
  const { container } = render(<Macro embeddedInDashboard />);
  await screen.findByText('Published macro observations');
  expect(container.textContent).toContain('Source: FRED (Federal Reserve Bank of St. Louis)');
  expect(container.textContent).toContain('As of 2026-10-02');
  expect(container.textContent).toContain('CPI YoY (as of 2026-10-02)');
  expect(container.textContent).not.toContain('Macro database');
  expect(container.textContent).not.toContain('2026-10-05T13:00:00Z');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});

it('renders the FRED label on the free macro readings', async () => {
  state.tier = 'free';
  const { container } = render(<Macro embeddedInDashboard />);
  await screen.findByText('4.20%');
  expect(container.textContent).toContain('Source: FRED (Federal Reserve Bank of St. Louis)');
  expect(container.textContent).toContain('As of 2026-10-02');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
