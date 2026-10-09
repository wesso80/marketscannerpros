import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { safeNext } from '@/lib/free/safeNext';
import { checkoutCustomerFromSession, checkoutReturnPath, checkoutSignInPath, shouldResumeCheckout } from '@/lib/checkoutSignIn';

const mocks = vi.hoisted(() => ({
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test' })),
  q: vi.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]),
  subscriptionsRetrieve: vi.fn(async () => ({ status: 'canceled', cancel_at_period_end: false, items: { data: [] as unknown[] } })),
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
    subscriptions = { retrieve: (...args: unknown[]) => mocks.subscriptionsRetrieve(...args) };
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

  const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const PAST = new Date(Date.now() - 10 * 86_400_000).toISOString();

  function subRow(overrides: Record<string, unknown> = {}) {
    return {
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_live',
      stripe_customer_id: 'cus_Live',
      current_period_end: FUTURE,
      is_trial: false,
      ...overrides,
    };
  }

  function stripeSub(status: string, priceId = 'price_test_monthly', extra: Record<string, unknown> = {}) {
    return {
      status,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: priceId } }] },
      ...extra,
    };
  }

  beforeEach(() => {
    mocks.session = null;
    mocks.create.mockClear();
    mocks.subscriptionsRetrieve.mockReset();
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled', 'price_not_pro'));
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
    expect(eligibility.some((sql) => sql.includes('stripe_subscription_id') && sql.includes('is_trial') && sql.includes('status') && !sql.includes('LIMIT 1'))).toBe(true);
  });

  it.each([
    ['a stored admin trial', 'FROM user_trials'],
    ['a Stripe subscription id', 'FROM user_subscriptions'],
  ])('does not grant a trial when the email has %s', async (_label, table) => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    mocks.q.mockImplementation(async (sql: string) => {
      if (!sql.includes(table)) return [];
      if (table === 'FROM user_subscriptions') {
        return [{ stripe_subscription_id: 'sub_paid', stripe_customer_id: 'cus_Paid', is_trial: false, status: 'canceled' }];
      }
      return [{ ok: 1 }];
    });
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { subscription_data?: unknown };
    expect(params.subscription_data).toBeUndefined();
  });

  function rowsOf(...rows: Record<string, unknown>[]) {
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM user_subscriptions') ? rows : []));
  }

  async function expectAlreadySubscribed() {
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'You already have Pro. Manage it in billing.',
      code: 'already_subscribed',
      portalUrl: '/api/payments/portal',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  }

  async function expectBillingCheckFailed() {
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "We couldn't confirm your billing status right now. Please try again in a minute or open billing.",
      code: 'billing_check_failed',
      portalUrl: '/api/payments/portal',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  }

  async function expectCheckoutOpens() {
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(200);
    expect((await res.json()).code).not.toBe('already_subscribed');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    return res;
  }

  it('returns 409 already_subscribed when a duplicate row has a live Pro subscription', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(
      { stripe_subscription_id: null, stripe_customer_id: null, is_trial: false, status: 'active', tier: 'free' },
      subRow({ stripe_subscription_id: 'sub_paid', stripe_customer_id: 'cus_PaidUser1' }),
    );
    await expectAlreadySubscribed();
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing'] as const)(
    'does not open checkout for an in-period %s Pro row',
    async (status) => {
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ status, is_trial: status === 'trialing', current_period_end: FUTURE }));
      await expectAlreadySubscribed();
      expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
    },
  );

  it.each(['past_due', 'unpaid'] as const)(
    'sends a %s row to the portal when Stripe still has it on a Pro price',
    async (status) => {
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ status, current_period_end: PAST }));
      mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub(status));
      await expectAlreadySubscribed();
      expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
    },
  );

  it('opens checkout for a past_due row when Stripe is live on a price that is not Pro', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'past_due', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('past_due', 'price_not_pro'));
    await expectCheckoutOpens();
  });

  it('sends a past_due row to the portal when Stripe says the Pro subscription is active', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'past_due', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('active'));
    await expectAlreadySubscribed();
  });

  it.each(['past_due', 'unpaid'] as const)(
    'opens checkout for a %s row when Stripe says the subscription is canceled',
    async (status) => {
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ status, current_period_end: PAST }));
      mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled'));
      await expectCheckoutOpens();
      expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
    },
  );

  it.each(['past_due', 'unpaid'] as const)(
    'keeps a %s row closed when the Stripe confirm call fails',
    async (status) => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ status, stripe_subscription_id: 'sub_owed', current_period_end: PAST }));
      mocks.subscriptionsRetrieve.mockRejectedValue(Object.assign(new Error('No such subscription: sub_owed reader@example.test'), { code: 'resource_missing' }));
      await expectBillingCheckFailed();
      const logged = errSpy.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('subscription confirm failed (resource_missing)');
      expect(logged).not.toContain('reader@example.test');
      expect(logged).not.toContain('sub_owed');
      errSpy.mockRestore();
    },
  );

  it('opens checkout for a canceled subscription', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'canceled', current_period_end: PAST }));
    await expectCheckoutOpens();
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it('opens checkout for an incomplete subscription', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'incomplete', current_period_end: FUTURE }));
    await expectCheckoutOpens();
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it('sends cancel_at_period_end to the portal when Stripe still says the Pro subscription is active', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('active', 'price_test_monthly', { cancel_at_period_end: true }));
    await expectAlreadySubscribed();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
  });

  it('opens checkout for a stale trial when Stripe says the subscription is not live', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'trialing', is_trial: true, current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled'));
    await expectCheckoutOpens();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
  });

  it('refuses a stale trial when Stripe says the Pro subscription is still live', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'trialing', is_trial: true, current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('trialing'));
    await expectAlreadySubscribed();
  });

  it('opens checkout for a stale active row when Stripe says it is not live', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled'));
    await expectCheckoutOpens();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
  });

  it('refuses a stale active row when Stripe says the Pro subscription is still live', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('past_due'));
    await expectAlreadySubscribed();
  });

  it('keeps a stale trial closed when the Stripe confirm call fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'trialing', is_trial: true, current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockRejectedValue(Object.assign(new Error('No such subscription: sub_live reader@example.test'), { code: 'resource_missing' }));
    await expectBillingCheckFailed();
    const logged = errSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('subscription confirm failed (resource_missing)');
    expect(logged).not.toContain('reader@example.test');
    expect(logged).not.toContain('sub_live');
    errSpy.mockRestore();
  });

  it('keeps a stale active row closed when the Stripe confirm call fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', current_period_end: PAST }));
    mocks.subscriptionsRetrieve.mockRejectedValue(Object.assign(new Error('No such subscription: sub_live reader@example.test'), { code: 'resource_missing' }));
    await expectBillingCheckFailed();
    const logged = errSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('reader@example.test');
    expect(logged).not.toContain('sub_live');
    errSpy.mockRestore();
  });

  it('asks Stripe before refusing an active Pro row with a null period end', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', tier: 'pro', current_period_end: null }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled'));
    await expectCheckoutOpens();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
  });

  it('refuses an active Pro row with a null period end when Stripe confirms a live Pro price', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', tier: 'pro', current_period_end: null }));
    mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('active'));
    await expectAlreadySubscribed();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_live');
  });

  it('keeps an active Pro row with a null period end closed when the Stripe confirm call fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    rowsOf(subRow({ status: 'active', tier: 'pro', current_period_end: null }));
    mocks.subscriptionsRetrieve.mockRejectedValue(Object.assign(new Error('No such subscription: sub_live reader@example.test'), { code: 'resource_missing' }));
    await expectBillingCheckFailed();
    const logged = errSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('reader@example.test');
    expect(logged).not.toContain('sub_live');
    errSpy.mockRestore();
  });

  it.each(['active', 'trialing'] as const)(
    'refuses a free %s row when Stripe says the subscription is live on a Pro price',
    async (status) => {
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ tier: 'free', status, is_trial: status === 'trialing', stripe_subscription_id: 'sub_free_label', current_period_end: FUTURE }));
      mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub(status === 'trialing' ? 'trialing' : 'active'));
      await expectAlreadySubscribed();
      expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_free_label');
    },
  );

  it.each(['active', 'trialing'] as const)(
    'opens checkout for a free %s row when Stripe says the subscription is canceled',
    async (status) => {
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ tier: 'free', status, is_trial: status === 'trialing', stripe_subscription_id: 'sub_free_label', current_period_end: FUTURE }));
      mocks.subscriptionsRetrieve.mockResolvedValue(stripeSub('canceled'));
      await expectCheckoutOpens();
      expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_free_label');
    },
  );

  it.each(['active', 'trialing'] as const)(
    'keeps a free %s row with a subscription id closed when the Stripe confirm call fails',
    async (status) => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
      rowsOf(subRow({ tier: 'free', status, is_trial: status === 'trialing', stripe_subscription_id: 'sub_free_label', current_period_end: FUTURE }));
      mocks.subscriptionsRetrieve.mockRejectedValue(Object.assign(new Error('No such subscription: sub_free_label reader@example.test'), { code: 'resource_missing' }));
      await expectBillingCheckFailed();
      const logged = errSpy.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('subscription confirm failed (resource_missing)');
      expect(logged).not.toContain('reader@example.test');
      expect(logged).not.toContain('sub_free_label');
      errSpy.mockRestore();
    },
  );

  it('continues checkout when the subscription read fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    mocks.q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('current_period_end')) throw new Error('connection terminated for reader@example.test');
      return [];
    });
    const res = await expectCheckoutOpens();
    const params = mocks.create.mock.calls[0][0] as { subscription_data?: { trial_period_days?: number } };
    expect(params.subscription_data).toEqual({ trial_period_days: 7 });
    expect(res.status).toBe(200);
    const logged = errSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('Subscription read failed; continuing checkout');
    expect(logged).not.toContain('reader@example.test');
    errSpy.mockRestore();
  });

  it('still opens checkout for a manual grant that has no stripe subscription id', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro_trader', workspaceId: 'w', exp: 0 };
    rowsOf({ stripe_subscription_id: '  ', stripe_customer_id: null, is_trial: false, status: 'active', tier: 'pro_trader' });
    const res = await POST(post({ plan: 'pro', billing: 'monthly' }));
    expect(res.status).toBe(200);
    const params = mocks.create.mock.calls[0][0] as { subscription_data?: { trial_period_days?: number } };
    expect(params.subscription_data).toEqual({ trial_period_days: 7 });
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
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
