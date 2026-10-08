// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const nav = vi.hoisted(() => ({ tab: 'portfolio', replace: vi.fn(), isLoggedIn: true, isLoading: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(`tab=${nav.tab}`),
  usePathname: () => '/tools/workspace',
}));
vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({ tier: nav.isLoggedIn ? 'pro' : 'anonymous', isLoggedIn: nav.isLoggedIn, isLoading: nav.isLoading, isAdmin: false, email: nav.isLoggedIn ? 'pro@example.com' : null }),
  canAccessJournalIntelligence: () => false,
}));
vi.mock('@/components/journal/JournalPage', () => ({ default: () => <div>Journal records</div> }));
vi.mock('@/app/tools/portfolio/page', () => ({ PortfolioContent: () => <div>Portfolio records</div>, default: () => null }));
vi.mock('@/app/tools/alerts/page', () => ({ AlertsContent: () => <div>Alerts records</div>, default: () => null }));
vi.mock('@/components/WatchlistWidget', () => ({ default: () => <div>Watchlist records</div> }));
vi.mock('@/components/backtest/BacktestHub', () => ({ default: () => <div>Backtest records</div> }));
vi.mock('@/app/tools/workspace/LearningTab', () => ({ default: () => <div>Learning records</div> }));
vi.mock('@/components/risk/RiskPermissionContext', () => ({
  RiskPermissionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRiskPermission: () => ({ isLocked: false }),
}));

import WorkspacePage from '@/app/tools/workspace/page';

beforeEach(() => {
  vi.stubGlobal('React', React);
  nav.tab = 'portfolio';
  nav.isLoggedIn = true;
  nav.isLoading = false;
  nav.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function visiblePanel() {
  return screen.getByRole('tabpanel');
}

it('mounts Portfolio, Journal, and Alerts inside the active tabpanel', async () => {
  const { rerender } = render(<WorkspacePage />);
  expect(visiblePanel().textContent).toContain('Portfolio records');
  expect(visiblePanel().querySelector('[hidden]')).toBeNull();

  nav.tab = 'journal';
  rerender(<WorkspacePage />);
  await waitFor(() => expect(visiblePanel().textContent).toContain('Journal records'));

  nav.tab = 'alerts';
  rerender(<WorkspacePage />);
  await waitFor(() => expect(visiblePanel().textContent).toContain('Alerts records'));

  const hidden = document.querySelectorAll('[role="tabpanel"][hidden]');
  expect(hidden.length).toBeGreaterThan(0);
  for (const panel of hidden) expect(panel.textContent).toBe('');
});

it('shows the account gate when signed out, without an empty tabpanel', () => {
  nav.isLoggedIn = false;
  render(<WorkspacePage />);
  expect(screen.getByText('Sign in required')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sign In' }).getAttribute('href')).toContain('/auth?next=');
  expect(screen.queryByRole('tabpanel')).toBeNull();
});

it('keeps a readable panel while the signed-in shell is up, and does not client-split the bodies', () => {
  const page = readFileSync('app/tools/workspace/page.tsx', 'utf8');
  expect(page).toContain('content: panels[t]');
  expect(page).toContain('<JournalPageV1 tier={tier} embeddedInWorkspace />');
  expect(page).toContain('<PortfolioV1 embeddedInWorkspace />');
  expect(page).toContain('<AlertsContentV1 embeddedInWorkspace />');
  expect(page).not.toContain('ssr: false');
  expect(page).not.toContain('next/dynamic');
  expect(readFileSync('app/tools/portfolio/page.tsx', 'utf8')).toContain('Loading saved records…');
  expect(readFileSync('app/tools/alerts/page.tsx', 'utf8')).toContain('Loading alerts…');
});

it('design mode makes records distinct destinations and preserves the active body',async()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');
 const {rerender}=render(<WorkspacePage/>);
 expect(screen.getByRole('heading',{name:'Portfolio',exact:true})).toBeTruthy();
 expect(screen.getByText('Portfolio records')).toBeTruthy();
 expect(screen.queryByText('Journal records')).toBeNull();
 expect(screen.queryByRole('tablist',{name:'Track tabs'})).toBeNull();
 nav.tab='journal';rerender(<WorkspacePage/>);
 await waitFor(()=>expect(screen.getByRole('heading',{name:'Journal',exact:true})).toBeTruthy());
 expect(screen.getByText('Journal records')).toBeTruthy();
 expect(screen.queryByText('Portfolio records')).toBeNull();
 expect(screen.getByRole('button',{name:'Alerts'})).toBeTruthy();
});
it('design mode still refuses signed-out account records',()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');nav.isLoggedIn=false;render(<WorkspacePage/>);
 expect(screen.getByText('Sign in required')).toBeTruthy();expect(screen.queryByText('Portfolio records')).toBeNull();
});
