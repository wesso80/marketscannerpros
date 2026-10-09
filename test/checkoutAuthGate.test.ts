import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { safeNext } from '@/lib/free/safeNext';
import { checkoutCustomerFromSession, checkoutReturnPath, checkoutSignInPath, shouldResumeCheckout } from '@/lib/checkoutSignIn';

const mocks = vi.hoisted(() => ({
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test' })),
  q: vi.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]),
  customer: { id: 'cus_existing', deleted: false, email: 'reader@example.test' } as { id: string; deleted?: boolean; email?: string | null },
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
  q: (sql: string, params?: unknown[]) => mocks.q(sql, params),
}));

vi.mock('stripe', () => ({
  default: class Stripe {
    checkout = { sessions: { create: (...args: unknown[]) => mocks.create(...args) } };
    prices = { retrieve: async () => ({ recurring: {} }) };
    customers = { retrieve: async () => mocks.customer };
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
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
    mocks.customer = { id: 'cus_existing', deleted: false, email: 'reader@example.test' };
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

  it('uses the session email, ignores a body email, and grants 7 days when this email has no trial or subscription', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    const res = await POST(post({ plan: 'pro', billing: 'yearly', email: 'other@evil.test' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as {
      customer_email?: string;
      customer?: string;
      subscription_data?: { trial_period_days?: number };
      line_items: { price?: string; price_data?: unknown }[];
    };
    expect(params.customer_email).toBe('reader@example.test');
    expect(params.customer).toBeUndefined();
    expect(params.subscription_data).toEqual({ trial_period_days: 7 });
    expect(params.line_items).toEqual([{ price: 'price_test_yearly', quantity: 1 }]);
    expect(params.line_items[0].price_data).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain('product_data');
    const eligibility = mocks.q.mock.calls.map((call) => String(call[0]));
    expect(eligibility.some((sql) => sql.includes('FROM user_trials'))).toBe(true);
    expect(eligibility.some((sql) => sql.includes('stripe_subscription_id') && sql.includes('is_trial') && sql.includes("status = 'trialing'"))).toBe(true);
  });

  it.each([
    ['a stored admin trial', 'FROM user_trials'],
    ['a Stripe subscription id', 'FROM user_subscriptions'],
  ])('does not grant a trial when the email has %s', async (_label, table) => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    mocks.q.mockImplementation(async (sql: string) => (sql.includes(table) ? [{ ok: 1 }] : []));
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { subscription_data?: unknown };
    expect(params.subscription_data).toBeUndefined();
  });

  it('defers a referral coupon while the 7-day trial is granted', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM referrals') ? [{ ok: 1 }] : []));
    const res = await POST(post({ plan: 'pro', billing: 'monthly', referralCode: 'FRIEND' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { subscription_data?: { trial_period_days?: number }; discounts?: unknown };
    expect(params.subscription_data).toEqual({ trial_period_days: 7 });
    expect(params.discounts).toBeUndefined();
  });

  it('attaches an existing Stripe customer instead of a caller-supplied email', async () => {
    mocks.session = { cid: 'cus_existing', tier: 'free', workspaceId: 'w', exp: 0 };
    const res = await POST(post({ plan: 'pro', billing: 'monthly', email: 'other@evil.test' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { customer?: string; customer_email?: string };
    expect(params.customer).toBe('cus_existing');
    expect(params.customer_email).toBeUndefined();
    expect((params as { subscription_data?: { trial_period_days?: number } }).subscription_data).toEqual({ trial_period_days: 7 });
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
