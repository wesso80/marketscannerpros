// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '@/components/Header';
import WorkflowNavigation from '@/components/WorkflowNavigation';
import { primaryNavTools, workflowArea } from '@/lib/toolWorkflows';
const state = vi.hoisted(() => ({ pathname: '/tools/msp-radar', params: new URLSearchParams(), loggedIn: true }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useSearchParams: () => state.params }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ isLoggedIn: state.loggedIn, tier: state.loggedIn ? 'pro' : 'anonymous', isLoading: false }) }));
vi.mock('@/components/NotificationBell', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  state.pathname = '/tools/msp-radar'; state.params = new URLSearchParams(); state.loggedIn = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = (element: React.ReactNode) => act(() => root.render(element));
const click = (element: Element | null) => act(() => (element as HTMLElement).click());
const links = (el: Element) => [...el.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')]);
const expected = [['Overview', '/tools/command-center'], ['Daily Radar', '/tools/msp-radar'], ['Scanner', '/tools/scanner'], ['Symbol', '/tools/golden-egg'], ['Options', '/tools/options'], ['Track', '/tools/workspace?tab=journal']];
describe('Phase 1 navigation', () => {
  it('has exactly six ordered destinations and a separate Radar area', () => {
    expect(primaryNavTools.map(t => [t.label, t.href])).toEqual(expected);
    expect(workflowArea('/tools/msp-radar')).toBe('radar');
    expect(workflowArea('/tools/command-center')).toBe('overview');
  });
  it('renders the same menu on desktop and drawer, with only Radar active', () => {
    render(<Header />);
    for (const parent of [container.querySelector('nav')!, container.querySelector('[role="dialog"]')!]) {
      expect(links(parent).slice(0, 6)).toEqual(expected);
      expect(links(parent)).toContainEqual(['All tools', '/tools']);
      expect([...parent.querySelectorAll('[aria-current="page"]')].map(a => a.textContent)).toEqual(['Daily Radar']);
    }
    expect(container.querySelector('nav a[href="/tools/referrals"]')).toBeNull();
    const account = container.querySelector('[aria-haspopup="menu"]')!;
    click(account);
    expect(account.getAttribute('aria-expanded')).toBe('true');
    const menu = container.querySelector('[role="menu"]')!;
    expect(links(menu)).toEqual([['Account settings', '/account'], ['Referrals', '/tools/referrals'], ['Compliance Hub', '/compliance-hub']]);
    expect(document.activeElement).toBe(menu.querySelector('a'));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('Compliance Hub');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(account);
  });
  it('preserves symbol handoff and drawer focus trap/Escape', () => {
    state.params = new URLSearchParams('symbol=SUI&type=crypto&timeframe=1h');
    render(<Header />);
    expect(container.querySelector('nav a[href*="golden-egg"]')?.getAttribute('href')).toBe('/tools/golden-egg?symbol=SUI&type=crypto&timeframe=1h');
    expect(container.querySelector('nav a[href*="/options"]')?.getAttribute('href')).toBe('/tools/options');
    const open = container.querySelector('[aria-label="Open menu"]')!; click(open);
    const dialog = container.querySelector('[role="dialog"]')!;
    const buttons = dialog.querySelectorAll<HTMLElement>('a[href], button');
    expect(document.activeElement).toBe(buttons[0]);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(open); expect(dialog.getAttribute('aria-hidden')).toBe('true');
  });
  it('keeps Compliance under More for logged-out visitors', () => {
    state.loggedIn = false; render(<Header />);
    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('More'); expect(links(dialog)).toContainEqual(['Compliance Hub', '/compliance-hub']);
    expect(links(dialog).some(([label]) => label === 'Referrals')).toBe(false);
  });
  it.each(['/tools/command-center', '/tools/msp-radar', '/tools/scanner', '/tools/golden-egg', '/tools/options'])('hides the single-link bar for %s', pathname => {
    state.pathname = pathname; render(<WorkflowNavigation />); expect(container.innerHTML).toBe('');
  });
  it('retains all Track tabs', () => {
    state.pathname = '/tools/workspace'; state.params = new URLSearchParams('tab=journal'); render(<WorkflowNavigation />);
    for (const label of ['Journal', 'Portfolio', 'Watchlists', 'Alerts', 'Backtest', 'Learning']) expect(container.textContent).toContain(label);
  });
});
