import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_SIGNING_SECRET = 'login-tier-test-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_login_tier';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_pro_monthly';
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY = 'price_pro_trader_monthly';
});

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  customersList: vi.fn(),
  subscriptionsList: vi.fn(),
  customersUpdate: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock('@/lib/db', () => ({
  q: (...args: unknown[]) => mocks.q(...args),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    customers: {
      list: (...args: unknown[]) => mocks.customersList(...args),
      update: (...args: unknown[]) => mocks.customersUpdate(...args),
    },
    subscriptions: {
      list: (...args: unknown[]) => mocks.subscriptionsList(...args),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendNewSignupNotification: vi.fn(async () => undefined),
}));

import { POST, incomingMayReplaceSubscriptionRow } from '@/app/api/auth/login/route';
import { hashWorkspaceId } from '@/lib/workspaceHash';
import { signSessionToken, verifySessionToken } from '@/lib/auth';

type Row = {
  workspace_id: string;
  email: string;
  tier: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const db = {
  rows: [] as Row[],
  calls: [] as { sql: string; params: unknown[] }[],
  trials: [] as { email: string; tier: string; expires_at: string }[],
};

let ipSeq = 0;

function installDb(rows: Row[], trials: { email: string; tier: string; expires_at: string }[] = []) {
  db.rows = rows.map((row) => ({ ...row }));
  db.trials = trials.map((trial) => ({ ...trial }));
  db.calls = [];
  mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    db.calls.push({ sql: text, params });
    if (text.includes('FROM user_trials')) {
      const email = String(params[0] ?? '').toLowerCase();
      return db.trials.filter((trial) => trial.email.toLowerCase() === email);
    }
    if (text.includes('SELECT status, stripe_subscription_id FROM user_subscriptions')) {
      const row = db.rows.find((item) => item.workspace_id === params[0]);
      return row ? [{ status: row.status, stripe_subscription_id: row.stripe_subscription_id }] : [];
    }
    if (text.includes('SELECT') && text.includes('stripe_customer_id')) {
      const row = db.rows.find((item) => item.workspace_id === params[0]);
      return row ? [row] : [];
    }
    if (text.includes('SELECT tier FROM user_subscriptions')) {
      const row = db.rows.find((item) => item.workspace_id === params[0]);
      return row ? [{ tier: row.tier }] : [];
    }
    if (text.includes('INSERT INTO user_subscriptions')) {
      const [workspaceId, email, tier, status, stripeCustomerId, stripeSubscriptionId] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
      ];
      const existing = db.rows.find((row) => row.workspace_id === workspaceId);
      if (existing) {
        existing.email = email;
        existing.tier = tier;
        existing.status = status;
        if (stripeCustomerId != null) existing.stripe_customer_id = stripeCustomerId;
        if (stripeSubscriptionId != null) existing.stripe_subscription_id = stripeSubscriptionId;
      } else {
        db.rows.push({
          workspace_id: workspaceId,
          email,
          tier,
          status,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        });
      }
      return [];
    }
    if (text.includes('UPDATE user_subscriptions')) {
      const email = String(params[0]).toLowerCase();
      const listedIds = new Set((Array.isArray(params[1]) ? params[1] : []).map(String));
      const scopedToListedCustomers = text.includes('stripe_customer_id = ANY');
      if (text.includes('stripe_subscription_id IS NOT NULL')) {
        for (const row of db.rows) {
          if (row.email.toLowerCase() !== email || row.stripe_subscription_id == null) continue;
          if (scopedToListedCustomers && (row.stripe_customer_id == null || !listedIds.has(row.stripe_customer_id))) continue;
          row.status = 'canceled';
        }
      }
      return [];
    }
    throw new Error(`unexpected sql: ${text}`);
  });
}

function customer(id: string, created: number) {
  return { id, created, object: 'customer' };
}

function subscription(opts: {
  id: string;
  status: 'active' | 'trialing' | 'canceled';
  priceId?: string;
  priceIds?: string[];
  periodEnd: number;
  created: number;
}) {
  const priceIds = opts.priceIds ?? [opts.priceId ?? ''];
  return {
    id: opts.id,
    status: opts.status,
    created: opts.created,
    items: { data: priceIds.map((id) => ({ price: { id }, current_period_end: opts.periodEnd })) },
  };
}

function mockStripe(customers: { id: string; created: number }[], subs: Record<string, ReturnType<typeof subscription>[]>) {
  mocks.customersList.mockResolvedValue({ data: customers.map((item) => customer(item.id, item.created)) });
  mocks.subscriptionsList.mockImplementation(async (args: { customer: string }) => ({
    data: subs[args.customer] ?? [],
  }));
  mocks.customersUpdate.mockResolvedValue({});
}

function loginRequest(email: string) {
  ipSeq += 1;
  const loginNonce = signSessionToken({
    purpose: 'login_nonce',
    email,
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      'x-forwarded-for': `10.9.0.${ipSeq}`,
    },
    body: JSON.stringify({ email, loginNonce }),
  });
}

function cookiePayload(res: Response): Record<string, unknown> {
  const token = (res.headers.get('set-cookie') || '').match(/ms_auth=([^;]+)/)?.[1];
  expect(token).toBeTruthy();
  return verifySessionToken(token!);
}

function inserts() {
  return db.calls.filter((call) => call.sql.includes('INSERT INTO user_subscriptions'));
}

describe('login subscription resolution', () => {
  beforeEach(() => {
    mocks.q.mockReset();
    mocks.customersList.mockReset();
    mocks.subscriptionsList.mockReset();
    mocks.customersUpdate.mockReset();
    db.rows = [];
    db.calls = [];
    db.trials = [];
  });

  it('upgrades an older free email-hash row when Stripe has an active subscription', async () => {
    const email = 'josue@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([{
      workspace_id: workspaceId,
      email,
      tier: 'free',
      status: 'active',
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }]);
    mockStripe(
      [{ id: 'cus_josue', created: 10 }],
      { cus_josue: [subscription({ id: 'sub_josue', status: 'active', priceId: 'price_pro_monthly', periodEnd: 1_900_000_000, created: 20 })] },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('pro');
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro', cid: 'cus_josue', workspaceId });
    expect(db.rows.find((row) => row.workspace_id === workspaceId)).toMatchObject({
      tier: 'pro',
      status: 'active',
      stripe_customer_id: 'cus_josue',
      stripe_subscription_id: 'sub_josue',
    });
    expect(inserts()).toHaveLength(1);
    expect(mocks.customersList).toHaveBeenCalledWith({ email, limit: 100 });
  });

  it('cancels a lapsed Stripe row, leaves null-subscription rows alone, and issues a free cookie', async () => {
    const email = 'ralph@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([
      {
        workspace_id: workspaceId,
        email,
        tier: 'pro_trader',
        status: 'active',
        stripe_customer_id: 'cus_ralph',
        stripe_subscription_id: 'sub_ralph',
      },
      {
        workspace_id: 'sibling-free',
        email,
        tier: 'free',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      {
        workspace_id: 'sibling-grant',
        email,
        tier: 'pro',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
    ]);
    mockStripe(
      [{ id: 'cus_ralph', created: 10 }],
      { cus_ralph: [subscription({ id: 'sub_ralph', status: 'canceled', priceId: 'price_pro_trader_monthly', periodEnd: 1_700_000_000, created: 5 })] },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('free');
    expect(cookiePayload(res)).toMatchObject({ tier: 'free', cid: 'cus_ralph' });
    expect(inserts()).toHaveLength(0);
    const update = db.calls.find((call) => call.sql.includes('UPDATE user_subscriptions'));
    expect(update?.sql).toContain("status = 'canceled'");
    expect(update?.sql).toContain('stripe_subscription_id IS NOT NULL');
    expect(update?.sql).toContain('stripe_customer_id = ANY($2::text[])');
    expect(update?.sql.toLowerCase()).toContain('lower(email)');
    expect(update?.params).toEqual([email, ['cus_ralph']]);
    expect(db.rows.find((row) => row.workspace_id === workspaceId)?.status).toBe('canceled');
    expect(db.rows.find((row) => row.workspace_id === 'sibling-free')).toMatchObject({ tier: 'free', status: 'active', stripe_subscription_id: null });
    expect(db.rows.find((row) => row.workspace_id === 'sibling-grant')).toMatchObject({ tier: 'pro', status: 'active', stripe_subscription_id: null });
  });

  it('cancels only listed customers when a mixed-case Stripe customer was not returned', async () => {
    const email = 'ada@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([
      {
        workspace_id: workspaceId,
        email,
        tier: 'pro',
        status: 'active',
        stripe_customer_id: 'cus_lower',
        stripe_subscription_id: 'sub_lower',
      },
      {
        workspace_id: 'mixed-case-row',
        email: 'Ada@example.com',
        tier: 'pro',
        status: 'active',
        stripe_customer_id: 'cus_mixed',
        stripe_subscription_id: 'sub_mixed',
      },
    ]);
    mockStripe(
      [{ id: 'cus_lower', created: 10 }],
      { cus_lower: [subscription({ id: 'sub_lower', status: 'canceled', priceId: 'price_pro_monthly', periodEnd: 1_700_000_000, created: 5 })] },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('free');
    expect(cookiePayload(res)).toMatchObject({ tier: 'free', cid: 'cus_lower' });
    expect(mocks.customersList).toHaveBeenCalledWith({ email, limit: 100 });
    const update = db.calls.find((call) => call.sql.includes('UPDATE user_subscriptions'));
    expect(update?.sql).toContain('stripe_customer_id = ANY($2::text[])');
    expect(update?.params).toEqual([email, ['cus_lower']]);
    expect(db.rows.find((row) => row.stripe_customer_id === 'cus_lower')?.status).toBe('canceled');
    expect(db.rows.find((row) => row.stripe_customer_id === 'cus_mixed')).toMatchObject({
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_mixed',
    });
  });

  it('keeps a manual pro_trader grant on the email-hash row when Stripe has no customer', async () => {
    const email = 'grant@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([
      {
        workspace_id: workspaceId,
        email,
        tier: 'pro_trader',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      {
        workspace_id: 'sibling-free',
        email,
        tier: 'free',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
    ]);
    mockStripe([], {});

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('pro_trader');
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro_trader', cid: `free_${email}`, workspaceId });
    expect(inserts()).toHaveLength(0);
    expect(mocks.subscriptionsList).not.toHaveBeenCalled();
    const grantRead = db.calls.find((call) => call.sql.includes('stripe_customer_id'));
    expect(grantRead?.params).toEqual([workspaceId]);
    expect(grantRead?.sql.toLowerCase()).not.toContain('email');
    expect(db.rows.find((row) => row.workspace_id === workspaceId)).toMatchObject({ tier: 'pro_trader', status: 'active' });
  });

  it('does not let a sibling pro row block a free write, and does not treat a sibling free row as a grant', async () => {
    const email = 'sibling@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([
      {
        workspace_id: workspaceId,
        email,
        tier: 'free',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      {
        workspace_id: 'sibling-pro',
        email,
        tier: 'pro_trader',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
    ]);
    mockStripe([], {});

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect(cookiePayload(res).tier).toBe('free');
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].params.slice(0, 4)).toEqual([workspaceId, email, 'free', 'active']);
    expect(db.rows.find((row) => row.workspace_id === 'sibling-pro')).toMatchObject({ tier: 'pro_trader', status: 'active' });
  });

  it('writes free/active for a user with no subscription row and no Stripe customer', async () => {
    const email = 'new@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([]);
    mockStripe([], {});

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('free');
    expect(cookiePayload(res)).toMatchObject({ tier: 'free', workspaceId });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].params.slice(0, 4)).toEqual([workspaceId, email, 'free', 'active']);
    expect(db.rows.find((row) => row.workspace_id === workspaceId)).toMatchObject({ tier: 'free', status: 'active' });
  });

  it('does not write free when an active subscription price matches nothing and a row already exists', async () => {
    const email = 'priced@example.com';
    const workspaceId = hashWorkspaceId(email);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installDb([{
      workspace_id: workspaceId,
      email,
      tier: 'pro_trader',
      status: 'active',
      stripe_customer_id: 'cus_priced',
      stripe_subscription_id: 'sub_priced',
    }]);
    mockStripe(
      [{ id: 'cus_priced', created: 10 }],
      { cus_priced: [subscription({ id: 'sub_priced', status: 'active', priceId: 'price_unmapped', periodEnd: 1_900_000_000, created: 30 })] },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('pro_trader');
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro_trader', cid: 'cus_priced' });
    expect(inserts()).toHaveLength(0);
    expect(mocks.customersUpdate).not.toHaveBeenCalled();
    expect(db.rows[0]).toMatchObject({ tier: 'pro_trader', status: 'active' });
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('price_unmapped');
    expect(logged).not.toContain(email);
    errorSpy.mockRestore();
  });

  it('keeps the free write when an active subscription price matches nothing and no row exists', async () => {
    const email = 'priced-new@example.com';
    const workspaceId = hashWorkspaceId(email);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installDb([]);
    mockStripe(
      [{ id: 'cus_newprice', created: 10 }],
      { cus_newprice: [subscription({ id: 'sub_newprice', status: 'active', priceId: 'price_unmapped', periodEnd: 1_900_000_000, created: 30 })] },
    );

    try {
      const res = await POST(loginRequest(email));
      expect(res.status).toBe(200);
      expect(cookiePayload(res).tier).toBe('free');
      expect(inserts()).toHaveLength(1);
      expect(inserts()[0].params.slice(0, 4)).toEqual([workspaceId, email, 'free', 'active']);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('chooses the customer with the active subscription instead of the first listed customer', async () => {
    const email = 'multi@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([]);
    mockStripe(
      [
        { id: 'cus_trialing', created: 50 },
        { id: 'cus_active', created: 10 },
      ],
      {
        cus_trialing: [subscription({ id: 'sub_trialing', status: 'trialing', priceId: 'price_pro_monthly', periodEnd: 2_000_000_000, created: 80 })],
        cus_active: [
          subscription({ id: 'sub_later_trial', status: 'trialing', priceId: 'price_pro_monthly', periodEnd: 2_100_000_000, created: 90 }),
          subscription({ id: 'sub_active', status: 'active', priceId: 'price_pro_trader_monthly', periodEnd: 1_800_000_000, created: 40 }),
        ],
      },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro_trader', cid: 'cus_active', workspaceId });
    expect(mocks.customersList).toHaveBeenCalledTimes(1);
    expect(mocks.customersList.mock.calls[0][0]).toMatchObject({ email, limit: 100 });
    expect(mocks.subscriptionsList).toHaveBeenCalledTimes(2);
    expect(inserts()[0].params[4]).toBe('cus_active');
    expect(inserts()[0].params[5]).toBe('sub_active');
    expect(inserts()[0].params[3]).toBe('active');
    expect(inserts()[0].sql).toContain("NOT IN ('active', 'trialing', 'past_due', 'unpaid')");
  });

  it('does not write trialing over a live paid Stripe row when an admin trial is active', async () => {
    const email = 'trial-paid@example.com';
    const workspaceId = hashWorkspaceId(email);
    const expires = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    installDb(
      [{
        workspace_id: workspaceId,
        email,
        tier: 'pro',
        status: 'active',
        stripe_customer_id: 'cus_paid',
        stripe_subscription_id: 'sub_paid',
      }],
      [{ email, tier: 'pro', expires_at: expires }],
    );
    mockStripe([], {});

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tier: 'pro', isTrial: true });
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro', cid: `trial_${email}` });
    expect(inserts()).toHaveLength(0);
    expect(mocks.customersList).not.toHaveBeenCalled();
    expect(db.rows[0]).toMatchObject({
      tier: 'pro',
      status: 'active',
      stripe_customer_id: 'cus_paid',
      stripe_subscription_id: 'sub_paid',
    });

    db.rows[0].status = 'trialing';
    const stripeTrial = await POST(loginRequest(email));
    expect(cookiePayload(stripeTrial)).toMatchObject({ tier: 'pro', cid: `trial_${email}` });
    expect(inserts()).toHaveLength(0);
    expect(db.rows[0]).toMatchObject({
      tier: 'pro',
      status: 'trialing',
      stripe_subscription_id: 'sub_paid',
    });
  });

  it('still writes the admin trial onto a free row that has no Stripe subscription', async () => {
    const email = 'trial-free@example.com';
    const workspaceId = hashWorkspaceId(email);
    const expires = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    installDb(
      [{
        workspace_id: workspaceId,
        email,
        tier: 'free',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      }],
      [{ email, tier: 'pro', expires_at: expires }],
    );
    mockStripe([], {});

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro', cid: `trial_${email}` });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].params.slice(0, 6)).toEqual([workspaceId, email, 'pro', 'trialing', null, null]);
    expect(db.rows[0]).toMatchObject({ tier: 'pro', status: 'trialing', stripe_subscription_id: null });
  });

  it('writes free/active when the chosen trialing subscription has an unknown price and no row exists', async () => {
    const email = 'trial-unknown@example.com';
    const workspaceId = hashWorkspaceId(email);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installDb([]);
    mockStripe(
      [{ id: 'cus_trial_unknown', created: 10 }],
      { cus_trial_unknown: [subscription({ id: 'sub_trial_unknown', status: 'trialing', priceId: 'price_unmapped', periodEnd: 1_900_000_000, created: 30 })] },
    );

    try {
      const res = await POST(loginRequest(email));
      expect(res.status).toBe(200);
      expect(cookiePayload(res).tier).toBe('free');
      expect(inserts()).toHaveLength(1);
      expect(inserts()[0].params.slice(0, 4)).toEqual([workspaceId, email, 'free', 'active']);
      expect(inserts()[0].params[7]).toBe(false);
      expect(db.rows[0]).toMatchObject({ tier: 'free', status: 'active' });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('builds the tier from the chosen primary subscription only', async () => {
    const email = 'primary-only@example.com';
    const workspaceId = hashWorkspaceId(email);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installDb([]);
    mockStripe(
      [{ id: 'cus_primary', created: 10 }],
      {
        cus_primary: [
          subscription({ id: 'sub_primary', status: 'active', priceId: 'price_unmapped', periodEnd: 1_800_000_000, created: 20 }),
          subscription({ id: 'sub_other', status: 'trialing', priceId: 'price_pro_trader_monthly', periodEnd: 2_200_000_000, created: 90 }),
        ],
      },
    );

    try {
      const res = await POST(loginRequest(email));
      expect(res.status).toBe(200);
      expect(cookiePayload(res)).toMatchObject({ tier: 'free', cid: 'cus_primary', workspaceId });
      expect(inserts()[0].params.slice(0, 6)).toEqual([workspaceId, email, 'free', 'active', 'cus_primary', 'sub_primary']);
      expect(inserts()[0].params[7]).toBe(false);
      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain('price_unmapped');
      expect(logged).not.toContain('price_pro_trader_monthly');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('maps the tier from every item on the chosen subscription, not only the first', async () => {
    const email = 'items@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([]);
    mockStripe(
      [{ id: 'cus_items', created: 10 }],
      {
        cus_items: [subscription({
          id: 'sub_items',
          status: 'active',
          priceIds: ['price_unmapped', 'price_pro_trader_monthly'],
          periodEnd: 1_900_000_000,
          created: 20,
        })],
      },
    );

    const res = await POST(loginRequest(email));
    expect(res.status).toBe(200);
    expect(cookiePayload(res)).toMatchObject({ tier: 'pro_trader', cid: 'cus_items', workspaceId });
    expect(inserts()[0].params.slice(0, 4)).toEqual([workspaceId, email, 'pro_trader', 'active']);
  });

  it('does not let a free login overwrite a past_due or active Stripe subscription row', async () => {
    const email = 'guard@example.com';
    const workspaceId = hashWorkspaceId(email);
    installDb([
      {
        workspace_id: workspaceId,
        email,
        tier: 'pro',
        status: 'past_due',
        stripe_customer_id: 'cus_guard',
        stripe_subscription_id: 'sub_guard',
      },
    ]);
    mockStripe([], {});

    const pastDue = await POST(loginRequest(email));
    expect(pastDue.status).toBe(200);
    expect(cookiePayload(pastDue).tier).toBe('free');
    expect(inserts()).toHaveLength(0);
    expect(db.rows[0]).toMatchObject({ tier: 'pro', status: 'past_due', stripe_subscription_id: 'sub_guard' });

    db.rows[0].status = 'active';
    const active = await POST(loginRequest(email));
    expect(cookiePayload(active).tier).toBe('free');
    expect(inserts()).toHaveLength(0);
    expect(db.rows[0]).toMatchObject({ tier: 'pro', status: 'active', stripe_subscription_id: 'sub_guard' });
  });
});

describe('incomingMayReplaceSubscriptionRow', () => {
  const row = (status: string, stripe_subscription_id: string | null = 'sub_old') => ({ status, stripe_subscription_id });

  it('blocks a stale or different subscription from replacing a protected row', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
      expect(incomingMayReplaceSubscriptionRow(row(status), 'canceled', 'sub_other')).toBe(false);
      expect(incomingMayReplaceSubscriptionRow(row(status, 'sub_old'), 'incomplete', null)).toBe(false);
    }
    expect(incomingMayReplaceSubscriptionRow(row('past_due'), 'active', null)).toBe(false);
    expect(incomingMayReplaceSubscriptionRow(row('active', 'sub_old'), 'active', null)).toBe(false);
  });

  it('lets a live active or trialing subscription replace a protected row', () => {
    expect(incomingMayReplaceSubscriptionRow(row('past_due', 'sub_old'), 'active', 'sub_new')).toBe(true);
    expect(incomingMayReplaceSubscriptionRow(row('active', 'sub_old'), 'trialing', 'sub_other')).toBe(true);
    expect(incomingMayReplaceSubscriptionRow(row('unpaid'), 'trialing', null)).toBe(true);
    expect(incomingMayReplaceSubscriptionRow(row('active', null), 'active', null)).toBe(true);
  });

  it('still replaces a row whose status is not protected', () => {
    expect(incomingMayReplaceSubscriptionRow(row('canceled'), 'active', null)).toBe(true);
    expect(incomingMayReplaceSubscriptionRow(null, 'canceled', 'sub_x')).toBe(true);
  });
});
