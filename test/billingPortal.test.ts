import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isStripeCustomerId } from '@/lib/billingPortal';

const mocks = vi.hoisted(() => ({
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  create: vi.fn(async () => ({ url: 'https://billing.stripe.com/p/session/test' })),
  q: vi.fn(async (_sql: string, _params?: unknown[]) => [] as { stripe_customer_id?: string | null }[]),
}));

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_billing_portal';
});

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => mocks.session,
}));

vi.mock('@/lib/db', () => ({
  q: (sql: string, params?: unknown[]) => mocks.q(sql, params),
}));

vi.mock('stripe', () => ({
  default: class Stripe {
    billingPortal = { sessions: { create: (...args: unknown[]) => mocks.create(...args) } };
  },
}));

let POST: (req: NextRequest) => Promise<Response>;

function post() {
  return new NextRequest('https://marketscannerpros.app/api/payments/portal', { method: 'POST' });
}

describe('billing portal uses a real Stripe customer id', () => {
  beforeAll(async () => {
    POST = (await import('../app/api/payments/portal/route')).POST;
  });

  beforeEach(() => {
    mocks.session = null;
    mocks.create.mockClear();
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
  });

  it('returns 401 when signed out and does not call Stripe', async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns no_billing_account for an admin synthetic id and does not call Stripe', async () => {
    mocks.session = { cid: 'admin_bradleywessling@yahoo.com.au', tier: 'pro_trader', workspaceId: 'w', exp: 0 };
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_billing_account' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(String(mocks.q.mock.calls[0][0])).toContain('stripe_customer_id');
  });

  it('returns no_billing_account for a free user with no Stripe customer', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'free', workspaceId: 'w', exp: 0 };
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_billing_account' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates a portal session with the stored cus_ id and the same-origin return url', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([{ stripe_customer_id: 'cus_PaidUser1' }]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/session/test' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const params = mocks.create.mock.calls[0][0] as { customer: string; return_url: string; configuration?: string };
    expect(params).toEqual({
      customer: 'cus_PaidUser1',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
    expect(params.configuration).toBeUndefined();
    expect(new URL(params.return_url).origin).toBe('https://marketscannerpros.app');
  });

  it('creates a portal session when the session id itself is a cus_ id', async () => {
    mocks.session = { cid: 'cus_FromSession1', tier: 'pro', workspaceId: 'w', exp: 0 };
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      customer: 'cus_FromSession1',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('picks the cus_ row when a newer free duplicate has no Stripe customer id', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([
      { stripe_customer_id: null, updated_at: '2026-10-09T00:00:00.000Z', id: 2 },
      { stripe_customer_id: 'cus_PaidUser1', updated_at: '2026-01-01T00:00:00.000Z', id: 1 },
    ]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      customer: 'cus_PaidUser1',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
    const sql = String(mocks.q.mock.calls[0][0]);
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('updated_at DESC');
    expect(sql).not.toContain('LIMIT 1');
  });

  it('uses the cus_ id on the live subscription row instead of a newer canceled customer', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([
      {
        workspace_id: 'other',
        tier: 'pro',
        status: 'canceled',
        stripe_customer_id: 'cus_NewerCanceled',
        stripe_subscription_id: 'sub_old',
        updated_at: '2026-10-09T00:00:00.000Z',
        id: 9,
      },
      {
        workspace_id: 'w',
        tier: 'pro',
        status: 'active',
        stripe_customer_id: 'cus_Live',
        stripe_subscription_id: 'sub_live',
        current_period_end: '2026-12-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
    ]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      customer: 'cus_Live',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
  });

  it('uses the past_due customer instead of a newer canceled customer', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([
      {
        workspace_id: 'w',
        tier: 'pro_trader',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        updated_at: '2026-10-09T00:00:00.000Z',
        id: 3,
      },
      {
        workspace_id: 'other',
        tier: 'pro',
        status: 'canceled',
        stripe_customer_id: 'cus_NewerCanceled',
        stripe_subscription_id: 'sub_old',
        updated_at: '2026-10-08T00:00:00.000Z',
        id: 2,
      },
      {
        workspace_id: 'other',
        tier: 'pro',
        status: 'past_due',
        stripe_customer_id: 'cus_PastDue',
        stripe_subscription_id: 'sub_past_due',
        current_period_end: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
    ]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      customer: 'cus_PastDue',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
  });

  it('falls back to another cus_ when the live row has a subscription id but no customer id', async () => {
    mocks.session = { cid: 'free_reader@example.test', tier: 'pro', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([
      {
        workspace_id: 'w',
        tier: 'pro',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: 'sub_live',
        updated_at: '2026-10-09T00:00:00.000Z',
        id: 2,
      },
      {
        workspace_id: 'other',
        tier: 'pro',
        status: 'canceled',
        stripe_customer_id: 'cus_PaidUser1',
        stripe_subscription_id: 'sub_old',
        updated_at: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
    ]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      customer: 'cus_PaidUser1',
      return_url: 'https://marketscannerpros.app/tools/explorer',
    });
  });

  it('rejects a stored id that does not have the cus_ prefix', async () => {
    mocks.session = { cid: 'admin_bradleywessling@yahoo.com.au', tier: 'pro_trader', workspaceId: 'w', exp: 0 };
    mocks.q.mockResolvedValue([{ stripe_customer_id: 'admin_bradleywessling@yahoo.com.au' }]);
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_billing_account' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(isStripeCustomerId('admin_bradleywessling@yahoo.com.au')).toBe(false);
    expect(isStripeCustomerId('cus_PaidUser1')).toBe(true);
  });
});
