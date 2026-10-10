// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { publicDailyLimit, PUBLIC_PRO_LOUNGE_FEATURE, symbolQuotaKey } from '@/lib/publicPlans';
import { discordInviteHref } from '@/lib/discordInvite';
import { isPaidTier } from '@/lib/tiers';
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ isLoggedIn: false, isLoading: false }) }));
import Footer from '@/components/Footer';
import PublicDesignShell from '@/components/public-design/PublicDesignShell';
import ResearchPricing from '@/components/public-design/ResearchPricing';
import LegacyPricing from '@/components/Pricing';

const INVITE = 'https://discord.gg/pro-lounge';

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('keeps plan quotas independent of the lounge line', () => {
  expect(PUBLIC_PRO_LOUNGE_FEATURE).toBe('Private Pro lounge on our Discord');
  expect(publicDailyLimit('pro', 'ai')).toBe(20);
  expect(publicDailyLimit('free', 'symbol')).toBe(3);
  expect(publicDailyLimit('visitor', 'ai')).toBe(0);
  expect(publicDailyLimit('pro', 'symbol')).toBeNull();
  expect(symbolQuotaKey('equity', 'AAPL')).toBe('equity:AAPL');
  expect(() => publicDailyLimit('enterprise' as never, 'ai')).toThrow(/Invalid public quota policy/);
  expect(isPaidTier('pro')).toBe(true);
  expect(isPaidTier('pro_trader')).toBe(true);
  expect(isPaidTier('free')).toBe(false);
  expect(isPaidTier('anonymous')).toBe(false);
});

it('hides the footer Discord link when the invite env is unset, empty, or whitespace', () => {
  for (const value of [undefined, '', '   ']) {
    vi.stubEnv('NEXT_PUBLIC_DISCORD_INVITE_URL', value as string | undefined);
    expect(discordInviteHref()).toBeNull();
    const { unmount } = render(<Footer />);
    expect(screen.queryByRole('link', { name: 'Discord' })).toBeNull();
    expect(document.body.textContent).not.toContain('Discord');
    unmount();
    const shell = render(<PublicDesignShell workspace={false}>Page</PublicDesignShell>);
    expect(screen.queryByRole('link', { name: 'Discord' })).toBeNull();
    shell.unmount();
  }
});

it('shows the footer Discord link in a new tab when the invite env is set', () => {
  vi.stubEnv('NEXT_PUBLIC_DISCORD_INVITE_URL', `  ${INVITE}  `);
  expect(discordInviteHref()).toBe(INVITE);
  render(<Footer />);
  const footerLink = screen.getByRole('link', { name: 'Discord' });
  expect(footerLink.getAttribute('href')).toBe(INVITE);
  expect(footerLink.getAttribute('target')).toBe('_blank');
  expect(footerLink.getAttribute('rel')).toBe('noopener');
  cleanup();
  render(<PublicDesignShell workspace={false}>Page</PublicDesignShell>);
  const siteLink = screen.getByRole('link', { name: 'Discord' });
  expect(siteLink.getAttribute('href')).toBe(INVITE);
  expect(siteLink.getAttribute('target')).toBe('_blank');
  expect(siteLink.getAttribute('rel')).toBe('noopener');
  cleanup();
  render(<PublicDesignShell workspace>Page</PublicDesignShell>);
  const workspaceLink = screen.getByRole('link', { name: 'Discord' });
  expect(workspaceLink.getAttribute('href')).toBe(INVITE);
  expect(workspaceLink.getAttribute('target')).toBe('_blank');
  expect(workspaceLink.getAttribute('rel')).toBe('noopener');
});

it('lists the lounge on the live pricing card even when daily quotas are off', () => {
  const props = { cycle: 'monthly' as const, onCycle: () => {}, onChoose: () => {}, loading: null, error: null, tier: null, quotasEnabled: false };
  render(<ResearchPricing {...props} />);
  expect(screen.getByText(PUBLIC_PRO_LOUNGE_FEATURE)).toBeTruthy();
  expect(screen.queryByText(/AI questions a day/)).toBeNull();
  cleanup();
  expect(readFileSync('app/pricing/page.tsx', 'utf8')).toContain('PUBLIC_PRO_LOUNGE_FEATURE');
  expect(readFileSync('lib/email.ts', 'utf8')).toContain("['DSC', PUBLIC_PRO_LOUNGE_FEATURE,");
  render(<LegacyPricing loading={null} onLaunch={() => {}} onCheckout={() => {}} />);
  expect(screen.getByText((_, node) => node?.tagName === 'LI' && (node.textContent ?? '').includes(PUBLIC_PRO_LOUNGE_FEATURE))).toBeTruthy();
});
