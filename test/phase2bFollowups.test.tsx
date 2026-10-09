// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({ favorites: [], loading: false, error: 'Sign in to load your saved pages.', degraded: false, toggleFavorite: async () => {}, addFavorite: async () => {}, removeFavorite: async () => {}, isFavorite: () => false, refresh: async () => {} }),
}));

import FavoritesPanel from '@/components/FavoritesPanel';

afterEach(() => cleanup());

const read = (path: string) => readFileSync(path, 'utf8');

it('signed-out My Pages is a finished sign-in card without raw placeholders', () => {
  render(<FavoritesPanel embeddedInDashboard />);
  expect(screen.getByRole('heading', { name: 'My Pages' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/auth?next=/tools/dashboard');
  expect(document.body.textContent).not.toMatch(/Last bar|n\/a|Awaiting data|\bDEGRADED\b|\bMISSING\b/);
  const dashboard = read('app/tools/dashboard/page.tsx');
  expect(dashboard).not.toMatch(/Last bar/);
  expect(dashboard).not.toMatch(/status:\s*401/);
  expect(dashboard).toContain("router.replace('/tools/command-center')");
});

it('tool document titles are one visible name', () => {
  const tools = read('app/tools/layout.tsx');
  expect(tools).toContain("default: 'All tools'");
  expect(tools).toContain("template: '%s | MarketScanner Pros'");
  expect(tools).not.toContain('Workflow | MarketScanner Pros');
  const titles: Record<string, string> = {
    'app/tools/command-center/layout.tsx': "title: 'Overview'",
    'app/tools/golden-egg/layout.tsx': 'title: "Symbol"',
    'app/tools/msp-radar/layout.tsx': 'title: "Daily Radar"',
    'app/tools/market-movers/layout.tsx': "title: 'Market Movers'",
    'app/tools/dashboard/layout.tsx': "title: 'Dashboard'",
    'app/tools/options/layout.tsx': "title: 'Options'",
    'app/tools/crypto-dashboard/layout.tsx': "title: 'Crypto Derivatives'",
    'app/tools/workspace/layout.tsx': "title: 'Track'",
  };
  for (const [file, title] of Object.entries(titles)) expect(read(file), file).toContain(title);
  for (const folder of readdirSync('app/tools')) {
    const path = `app/tools/${folder}/layout.tsx`;
    try {
      const source = read(path);
      const first = source.match(/title:\s*['"]([^'"]+)['"]/);
      if (first) expect(first[1], path).not.toMatch(/\| MarketScanner Pros$/);
    } catch { /* directory without a layout */ }
  }
  expect(read('app/v2/_components/RegimeBar.tsx')).toContain('Not available right now');
  expect(read('app/v2/_components/RegimeBar.tsx')).not.toContain('Unavailable');
});

it('pricing calls the live Intelligence modules live', () => {
  const pricing = read('app/pricing/page.tsx');
  expect(pricing).toContain('Live with Pro: Global M2, Liquidity Transmission and Market Fragility');
  expect(pricing).not.toContain('the live Intelligence modules (Global M2, Liquidity Transmission and Market Fragility)');
  expect(pricing).not.toContain('Lead/Lag');
  expect(pricing).not.toContain('NQ Pressure');
  expect(pricing).not.toMatch(/\bAuction\b/);
  expect(pricing).not.toMatch(/\bMaster\b/);
  expect(pricing).not.toContain('Production Intelligence');
  expect(pricing).not.toContain('entire Intelligence suite');
});
