import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { safeNext } from '@/lib/free/safeNext';
import { checkoutCustomerFromSession, checkoutReturnPath, checkoutSignInPath, shouldResumeCheckout } from '@/lib/checkoutSignIn';

const mocks = vi.hoisted(() => ({
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test' })),
}));

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_gate';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_monthly';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_test_yearly';
});

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => mocks.session,
}));

vi.mock('@/lib/db', () => ({
  q: async () => [],
}));

vi.mock('stripe', () => ({
  default: class Stripe {
    checkout = { sessions: { create: (...args: unknown[]) => mocks.create(...args) } };
    prices = { retrieve: async () => ({ recurring: {} }) };
    coupons = {
      retrieve: async () => ({ id: 'referral_5_off' }),
      create: async () => ({ id: 'referral_5_off' }),
    };
  },
}));

let POST: (req: NextRequest) => Promise<Response>;

function post(body: unknown) {
  return new NextRequest('http://localhost/api/payments/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('checkout requires a signed-in account', () => {
  beforeAll(async () => {
    POST = (await import('../app/api/payments/checkout/route')).POST;
  });

  beforeEach(() => {
    mocks.session = null;
    mocks.create.mockClear();
  });

  it('returns 401 without a session and does not create a Stripe session', async () => {
    const res = await POST(post({ plan: 'pro', billing: 'monthly', email: 'visitor@example.test' }));
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 401 for an anonymous bypass session', async () => {
    mocks.session = { cid: 'anon-browser', tier: 'pro_trader', workspaceId: 'w', exp: 0 };
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('uses the session email, ignores a body email, and does not set a product or a trial', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    const res = await POST(post({ plan: 'pro', billing: 'yearly', email: 'other@evil.test' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as {
      customer_email?: string;
      customer?: string;
      subscription_data?: unknown;
      line_items: { price?: string; price_data?: unknown }[];
    };
    expect(params.customer_email).toBe('reader@example.test');
    expect(params.customer).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
    expect(params.line_items).toEqual([{ price: 'price_test_yearly', quantity: 1 }]);
    expect(params.line_items[0].price_data).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain('product_data');
    expect(JSON.stringify(params)).not.toContain('trial_period_days');
  });

  it('attaches an existing Stripe customer instead of a caller-supplied email', async () => {
    mocks.session = { cid: 'cus_existing', tier: 'free', workspaceId: 'w', exp: 0 };
    const res = await POST(post({ plan: 'pro', billing: 'monthly', email: 'other@evil.test' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { customer?: string; customer_email?: string };
    expect(params.customer).toBe('cus_existing');
    expect(params.customer_email).toBeUndefined();
  });
});

describe('checkout return path stays on this site', () => {
  it('builds a validated relative next and rejects open redirects', () => {
    expect(checkoutReturnPath('monthly')).toBe('/pricing?billing=monthly&plan=pro');
    expect(checkoutReturnPath('yearly')).toBe('/pricing?billing=yearly&plan=pro');
    const href = checkoutSignInPath('monthly');
    const next = new URL(href, 'https://marketscannerpros.app').searchParams.get('next');
    expect(safeNext(next)).toBe('/pricing?billing=monthly&plan=pro');
    expect(href.startsWith('/auth?next=')).toBe(true);
    for (const value of ['//evil.com', 'https://evil.com', '/\\evil.com', '/%2fevil.com']) {
      expect(safeNext(value)).toBeNull();
    }
  });

  it('resumes checkout only for a signed-in visitor who is not already Pro', () => {
    expect(shouldResumeCheckout('?billing=yearly&plan=pro', true, false)).toBe('yearly');
    expect(shouldResumeCheckout('plan=pro', true, false)).toBe('monthly');
    expect(shouldResumeCheckout('?billing=yearly&plan=pro', false, false)).toBeNull();
    expect(shouldResumeCheckout('?billing=yearly&plan=pro', true, true)).toBeNull();
    expect(shouldResumeCheckout('', true, false)).toBeNull();
  });

  it('reads the account email from free, trial, and admin session ids', () => {
    expect(checkoutCustomerFromSession('free_reader@example.test')).toEqual({ customer_email: 'reader@example.test' });
    expect(checkoutCustomerFromSession('trial_reader@example.test')).toEqual({ customer_email: 'reader@example.test' });
    expect(checkoutCustomerFromSession('admin_owner@example.test')).toEqual({ customer_email: 'owner@example.test' });
    expect(checkoutCustomerFromSession('cus_123')).toEqual({ customer: 'cus_123' });
    expect(checkoutCustomerFromSession('anon-browser')).toBeNull();
  });
});
