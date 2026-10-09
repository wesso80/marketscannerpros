/**
 * The $50 startup price lives on the Pro Trader product. Its id is not in the
 * repo. A configured Pro Trader price id is stored as pro_trader. An active
 * price id that is not configured keeps pro_trader when that tier already
 * exists, otherwise stores pro, and never stores free. A deleted subscription
 * still stores free (covered in stripeWebhookPeriod).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hasProAccess } from '@/lib/entitlements';

const WEBHOOK_SECRET = 'whsec_test_startup_price';
const STARTUP_PRICE = 'price_startup_50';
const UNCONFIGURED_PRICE = 'price_not_in_env';

const mocks = vi.hoisted(() => ({
  q: vi.fn(async () => [] as unknown[]),
  subscriptionsRetrieve: vi.fn(),
  customersRetrieve: vi.fn(async () => ({ id: 'cus_startup', email: 'member@example.test', deleted: false })),
}));

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_startup_price';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_startup_price';
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY = 'price_startup_50';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_pro_2499';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_pro_249';
});

vi.mock('@/lib/db', () => ({ q: (...args: unknown[]) => mocks.q(...args) }));
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: async () => undefined }));
vi.mock('stripe', async () => {
  const actual = await vi.importActual<typeof import('stripe')>('stripe');
  const RealStripe = actual.default;
  return {
    default: class extends RealStripe {
      constructor(key: string, config?: ConstructorParameters<typeof RealStripe>[1]) {
        super(key, config);
        this.subscriptions.retrieve = mocks.subscriptionsRetrieve as typeof this.subscriptions.retrieve;
        this.customers.retrieve = mocks.customersRetrieve as typeof this.customers.retrieve;
      }
    },
  };
});

let POST: (req: NextRequest) => Promise<Response>;
let sign: (payload: string) => string;

function subscription(priceId: string) {
  return {
    id: 'sub_startup',
    object: 'subscription',
    customer: 'cus_startup',
    status: 'active',
    items: {
      object: 'list',
      data: [{
        id: 'si_startup',
        object: 'subscription_item',
        quantity: 1,
        price: { id: priceId, object: 'price' },
        current_period_end: 1682288167,
        current_period_start: 1679609767,
      }],
      has_more: false,
      total_count: 1,
    },
  };
}

async function post(priceId: string) {
  const event = {
    id: `evt_${priceId}`,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1750000000,
    type: 'customer.subscription.updated',
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: subscription(priceId) },
  };
  const body = JSON.stringify(event);
  return POST(new NextRequest('https://example.test/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sign(body) },
    body,
  }));
}

function upsert() {
  return mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
}

describe('Pro Trader prices stay Pro without changing the webhook map', () => {
  beforeAll(async () => {
    POST = (await import('../app/api/webhooks/stripe/route')).POST;
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe('sk_test_startup_price', { apiVersion: '2025-09-30.clover' });
    sign = (payload: string) => stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  });

  beforeEach(() => {
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
    mocks.subscriptionsRetrieve.mockReset();
    mocks.customersRetrieve.mockClear();
  });

  it('stores a configured Pro Trader price as pro_trader, which has Pro access', async () => {
    expect(hasProAccess('pro_trader')).toBe(true);
    expect(hasProAccess('pro')).toBe(true);
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription(STARTUP_PRICE));
    const res = await post(STARTUP_PRICE);
    expect(res.status).toBe(200);
    const insert = upsert();
    expect(insert).toBeTruthy();
    expect((insert![1] as unknown[])[2]).toBe('pro_trader');
  });

  it('stores pro for an active unknown price when no paid tier exists, and never free', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription(UNCONFIGURED_PRICE));
    const res = await post(UNCONFIGURED_PRICE);
    expect(res.status).toBe(200);
    const insert = upsert();
    expect(insert).toBeTruthy();
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('active');
    expect(String(insert![0])).toContain("WHEN EXCLUDED.tier = 'free' AND EXCLUDED.status IN ('active', 'trialing')");
    expect(String(insert![0])).toContain("THEN 'pro'");
    expect(String(insert![0])).toContain('ON CONFLICT (workspace_id)');
  });

  it('keeps pro_trader when an active unknown price matches an existing paid row', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT tier FROM user_subscriptions')) {
        return [{ tier: 'free' }, { tier: 'pro_trader' }];
      }
      return [];
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription(UNCONFIGURED_PRICE));
    const res = await post(UNCONFIGURED_PRICE);
    expect(res.status).toBe(200);
    const insert = upsert();
    expect((insert![1] as unknown[])[2]).toBe('pro_trader');
    expect((insert![1] as unknown[])[2]).not.toBe('free');
  });

});
