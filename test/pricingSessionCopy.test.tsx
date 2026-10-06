// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { PLAN_PRICES } from '@/lib/planPrices';

const me = vi.hoisted(() => ({ ok: false, body: null as { email?: string; tier?: string } | null }));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

import PricingPage from '@/app/pricing/page';

const yearlyLine = `or ${PLAN_PRICES.pro.yearly}/year (about 2 months free)`;
const moduleNames = /Lead\/Lag|NQ Pressure|\bAuction\b|\bMaster\b/;

beforeEach(() => {
  vi.stubGlobal('React', React);
  me.ok = false;
  me.body = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/me')) {
      return { ok: me.ok, status: me.ok ? 200 : 401, json: async () => me.body };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPricing() {
  return render(<PricingPage />);
}

it('a Pro session shows Current plan and drops Start Free and the no-card line', async () => {
  me.ok = true;
  me.body = { email: 'pro@example.test', tier: 'pro' };
  renderPricing();
  expect(await screen.findByRole('button', { name: 'Current plan' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start Free' })).toBeNull();
  expect(screen.queryByText('No credit card required')).toBeNull();
  expect(screen.getByText('Included in your plan')).toBeTruthy();
  expect(document.body.textContent).toContain('Your current plan is marked below.');
  expect(document.body.textContent).not.toContain('Start free. Upgrade to Pro for the full platform.');
  expect(document.body.textContent).toContain(yearlyLine);
  expect(document.body.textContent).not.toMatch(moduleNames);
  expect(document.body.textContent).toContain(PLAN_PRICES.pro.monthly);
});

it('a signed-in Free session marks Free as the current plan without the no-card line', async () => {
  me.ok = true;
  me.body = { email: 'free@example.test', tier: 'free' };
  renderPricing();
  expect(await screen.findByRole('button', { name: 'Current plan' })).toBeTruthy();
  expect(screen.queryByText('No credit card required')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start Free' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Go Pro' })).toBeTruthy();
  expect(screen.queryByText('Included in your plan')).toBeNull();
  expect(document.body.textContent).toContain('Your current plan is marked below.');
  expect(document.body.textContent).toContain(yearlyLine);
  expect(document.body.textContent).not.toMatch(moduleNames);
});

it('an unknown tier such as admin does not say a plan is marked', async () => {
  me.ok = true;
  me.body = { email: 'admin@example.test', tier: 'admin' };
  renderPricing();
  expect(await screen.findByRole('button', { name: 'Start Free' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Current plan' })).toBeNull();
  expect(document.body.textContent).not.toContain('Your current plan is marked below.');
  expect(document.body.textContent).toContain('Start free. Upgrade to Pro for the full platform.');
});

it('a signed-out visitor still sees Start Free and the original hero', async () => {
  renderPricing();
  expect(await screen.findByRole('button', { name: 'Start Free' })).toBeTruthy();
  expect(screen.getByText('No credit card required')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go Pro' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Current plan' })).toBeNull();
  expect(screen.queryByText('Included in your plan')).toBeNull();
  expect(document.body.textContent).toContain('Start free. Upgrade to Pro for the full platform.');
  expect(document.body.textContent).toContain(yearlyLine);
  expect(document.body.textContent).not.toMatch(moduleNames);
});

it('monthly view takes the yearly price from PLAN_PRICES and the page has no roadmap module names', () => {
  const page = readFileSync('app/pricing/page.tsx', 'utf8');
  const layout = readFileSync('app/pricing/layout.tsx', 'utf8');
  expect(page).toContain('PLAN_PRICES.pro.yearly');
  expect(page).not.toContain("'$249'");
  expect(page).not.toContain('"$249"');
  expect(page).not.toMatch(moduleNames);
  expect(layout).not.toMatch(moduleNames);
  expect(page).toContain('7-day money-back guarantee');
  expect(page).toContain('PLAN_PRICES.pro.monthly');
  expect(page).not.toContain('Number.isInteger(monthsFree) ? String(monthsFree) : String(monthsFree)');
  expect(page).toContain('const shown = String(monthsFree)');
});
