// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const goTo = vi.hoisted(() => vi.fn());
const me = vi.hoisted(() => ({ authenticated: false, tier: null as string | null }));

vi.mock('@/lib/checkoutSignIn', async () => {
  const actual = await vi.importActual<typeof import('@/lib/checkoutSignIn')>('@/lib/checkoutSignIn');
  return { ...actual, goTo };
});

import PricingPage from '@/app/pricing/page';

beforeEach(() => {
  vi.stubGlobal('React', React);
  me.authenticated = false;
  me.tier = null;
  window.history.replaceState(null, '', '/pricing');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    if (path.includes('/api/payments/checkout')) {
      return { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test' }) };
    }
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  goTo.mockClear();
});

it('sends a signed-out Pro click to sign-in with a validated return path', async () => {
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('/auth?next=' + encodeURIComponent('/pricing?billing=monthly&plan=pro')));
  expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/api/payments/checkout'))).toBe(false);
});

it('keeps the chosen annual plan in the sign-in return path', async () => {
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Annual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pro checkout' }));
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('/auth?next=' + encodeURIComponent('/pricing?billing=yearly&plan=pro')));
});

it('starts checkout after sign-in when the return path names Pro', async () => {
  me.authenticated = true;
  me.tier = 'free';
  window.history.replaceState(null, '', '/pricing?billing=yearly&plan=pro');
  render(<PricingPage />);
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test'));
  const checkoutCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/api/payments/checkout'));
  expect(checkoutCall?.[1]).toEqual(expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ plan: 'pro', billing: 'yearly', referralCode: null }),
  }));
});

it('sends an already-subscribed member to the billing portal', async () => {
  me.authenticated = true;
  me.tier = 'free';
  vi.mocked(fetch).mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/payments/checkout')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: 'You already have Pro. Manage it in billing.',
          code: 'already_subscribed',
          portalUrl: '/api/payments/portal',
        }),
      };
    }
    if (path.includes('/api/payments/portal')) {
      return { ok: true, status: 200, json: async () => ({ url: 'https://billing.stripe.com/p/session/test' }) };
    }
    if (path.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  });
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  expect((await screen.findByRole('alert')).textContent).toContain('You already have Pro. Manage it in billing.');
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test'));
  const portalCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/api/payments/portal'));
  expect(portalCall?.[0]).toBe('/api/payments/portal');
  expect(portalCall?.[1]).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
  expect(goTo).not.toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
});

it('keeps the billing sentence when the portal cannot be opened', async () => {
  me.authenticated = true;
  me.tier = 'free';
  vi.mocked(fetch).mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/payments/checkout')) {
      return { ok: false, status: 409, json: async () => ({ code: 'already_subscribed', portalUrl: '/api/payments/portal' }) };
    }
    if (path.includes('/api/payments/portal')) return { ok: false, status: 404, json: async () => ({ error: 'no_billing_account' }) };
    if (path.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  });
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  expect((await screen.findByRole('alert')).textContent).toContain('You already have Pro. Manage it in billing.');
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/api/payments/portal'))).toBe(true));
  expect(goTo).not.toHaveBeenCalled();
});

it('shows the billing-check message with a button that opens billing', async () => {
  me.authenticated = true;
  me.tier = 'free';
  vi.mocked(fetch).mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/payments/checkout')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: "We couldn't confirm your billing status right now. Please try again in a minute or open billing.",
          code: 'billing_check_failed',
          portalUrl: '/api/payments/portal',
        }),
      };
    }
    if (path.includes('/api/payments/portal')) {
      return { ok: true, status: 200, json: async () => ({ url: 'https://billing.stripe.com/p/session/test' }) };
    }
    if (path.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  });
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("We couldn't confirm your billing status right now. Please try again in a minute or open billing.");
  expect(goTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open billing' }));
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test'));
  const portalCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/api/payments/portal'));
  expect(portalCall?.[0]).toBe('/api/payments/portal');
  expect(portalCall?.[1]).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
  expect(goTo).not.toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
});

it('shows support contact when billing confirmation has no Stripe customer', async () => {
  me.authenticated = true;
  me.tier = 'free';
  vi.mocked(fetch).mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/payments/checkout')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          code: 'billing_check_failed',
          portalUrl: '/api/payments/portal',
        }),
      };
    }
    if (path.includes('/api/payments/portal')) {
      return { ok: false, status: 404, json: async () => ({ error: 'no_billing_account' }) };
    }
    if (path.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  });
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open billing' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Contact support@marketscannerpros.app'));
  expect(screen.queryByRole('button', { name: 'Open billing' })).toBeNull();
  expect(goTo).not.toHaveBeenCalled();
});

it('sends a signed-in visitor back to sign-in when checkout returns 401', async () => {
  me.authenticated = true;
  me.tier = 'free';
  vi.mocked(fetch).mockImplementation(async (url: string) => {
    if (String(url).includes('/api/payments/checkout')) return { ok: false, status: 401, json: async () => ({ error: 'Sign in required' }) };
    if (String(url).includes('/api/me')) return { ok: true, status: 200, json: async () => ({ ...me, email: 'reader@example.test' }) };
    return { ok: true, status: 200, json: async () => ({ enabled: true }) };
  });
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to Pro checkout' }));
  await waitFor(() => expect(goTo).toHaveBeenCalledWith('/auth?next=' + encodeURIComponent('/pricing?billing=monthly&plan=pro')));
});
