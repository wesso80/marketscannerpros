import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = 'whsec_test_period_end';
const PRICE_ID = 'price_test_pro_monthly';
const ITEM_PERIOD_END = 1682288167;
const ITEM_PERIOD_START = 1679609767;
const LEGACY_PERIOD_END = 1714000000;
const LEGACY_PERIOD_START = 1711321600;

const mocks = vi.hoisted(() => ({
  q: vi.fn(async () => [] as unknown[]),
  sendWelcomeEmail: vi.fn(async () => undefined),
  subscriptionsRetrieve: vi.fn(),
  customersRetrieve: vi.fn(),
  createBalanceTransaction: vi.fn(),
}));

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_period_end';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_period_end';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_pro_monthly';
});

vi.mock('@/lib/db', () => ({
  q: (...args: unknown[]) => mocks.q(...args),
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: (...args: unknown[]) => mocks.sendWelcomeEmail(...args),
}));

vi.mock('stripe', async () => {
  const actual = await vi.importActual<typeof import('stripe')>('stripe');
  const RealStripe = actual.default;
  return {
    default: class extends RealStripe {
      constructor(key: string, config?: ConstructorParameters<typeof RealStripe>[1]) {
        super(key, config);
        this.subscriptions.retrieve = mocks.subscriptionsRetrieve as typeof this.subscriptions.retrieve;
        this.customers.retrieve = mocks.customersRetrieve as typeof this.customers.retrieve;
        this.customers.createBalanceTransaction =
          mocks.createBalanceTransaction as typeof this.customers.createBalanceTransaction;
      }
    },
  };
});

type Post = (req: NextRequest) => Promise<Response>;
let POST: Post;
let sign: (payload: string) => string;

function customer() {
  return { id: 'cus_test_period', object: 'customer', email: 'webhook-test@example.com' };
}

function cloverItem(period?: { end?: unknown; start?: unknown; priceId?: string }) {
  const item: Record<string, unknown> = {
    id: 'si_test_period',
    object: 'subscription_item',
    quantity: 1,
    price: { id: period?.priceId ?? PRICE_ID, object: 'price' },
  };
  if (!period || !('end' in period)) item.current_period_end = ITEM_PERIOD_END;
  else if (period.end !== undefined) item.current_period_end = period.end;
  if (!period || !('start' in period)) item.current_period_start = ITEM_PERIOD_START;
  else if (period.start !== undefined) item.current_period_start = period.start;
  return item;
}

/** Subscription shape for API 2025-09-30.clover: periods live on the item only. */
function cloverSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_period',
    object: 'subscription',
    customer: 'cus_test_period',
    status: 'active',
    items: {
      object: 'list',
      data: [cloverItem()],
      has_more: false,
      total_count: 1,
    },
    ...overrides,
  };
}

function legacySubscription() {
  return {
    id: 'sub_test_legacy',
    object: 'subscription',
    customer: 'cus_test_period',
    status: 'active',
    current_period_end: LEGACY_PERIOD_END,
    current_period_start: LEGACY_PERIOD_START,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_legacy',
          object: 'subscription_item',
          quantity: 1,
          price: { id: PRICE_ID, object: 'price' },
        },
      ],
      has_more: false,
      total_count: 1,
    },
  };
}

function stripeEvent(type: string, object: Record<string, unknown>, apiVersion: string) {
  return {
    id: `evt_test_${type.replaceAll('.', '_')}`,
    object: 'event',
    api_version: apiVersion,
    created: 1750000000,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

async function postEvent(event: Record<string, unknown>, signature?: string | null) {
  const body = JSON.stringify(event);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature === undefined) headers.set('stripe-signature', sign(body));
  else if (signature !== null) headers.set('stripe-signature', signature);
  const res = await POST(new NextRequest('https://example.test/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  }));
  return res;
}

function storedPeriodEnd(): unknown {
  const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
  expect(insert, 'expected an upsert into user_subscriptions').toBeTruthy();
  return (insert![1] as unknown[])[6];
}

function assertNoInvalidDates() {
  for (const call of mocks.q.mock.calls) {
    const params = call[1];
    if (!Array.isArray(params)) continue;
    for (const value of params) {
      if (value instanceof Date) {
        expect(Number.isNaN(value.getTime()), `invalid Date passed to q: ${value}`).toBe(false);
      }
    }
  }
}

function expectUnixDate(value: unknown, unixSeconds: number) {
  expect(value).toBeInstanceOf(Date);
  expect(Number.isNaN((value as Date).getTime())).toBe(false);
  expect((value as Date).toISOString()).toBe(new Date(unixSeconds * 1000).toISOString());
}

describe('Stripe webhook period fields (API 2025-09-30.clover)', () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_period_end';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = PRICE_ID;
    const route = await import('../app/api/webhooks/stripe/route');
    POST = route.POST;
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' });
    sign = (payload: string) => stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
  });

  beforeEach(() => {
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
    mocks.sendWelcomeEmail.mockReset();
    mocks.sendWelcomeEmail.mockResolvedValue(undefined);
    mocks.subscriptionsRetrieve.mockReset();
    mocks.customersRetrieve.mockReset();
    mocks.customersRetrieve.mockResolvedValue(customer());
    mocks.createBalanceTransaction.mockReset();
  });

  it('checkout.session.completed reads current_period_end from the subscription item', async () => {
    const subscription = cloverSubscription();
    expect(subscription).not.toHaveProperty('current_period_end');
    expect(subscription).not.toHaveProperty('current_period_start');
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);

    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_test_period',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
      payment_status: 'paid',
      metadata: {},
    }, '2025-09-30.clover'));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    assertNoInvalidDates();
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_test_period');
  });

  it('customer.subscription.created reads the item period when the top-level field is absent', async () => {
    const subscription = cloverSubscription({ status: 'trialing' });
    const res = await postEvent(stripeEvent(
      'customer.subscription.created',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    assertNoInvalidDates();
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[7]).toBe(true);
  });

  it('customer.subscription.updated prefers the item period over a legacy top-level value', async () => {
    const subscription = cloverSubscription({
      current_period_end: LEGACY_PERIOD_END,
      current_period_start: LEGACY_PERIOD_START,
    });
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    assertNoInvalidDates();
  });

  it('customer.subscription.deleted stores null and does not build a date', async () => {
    const res = await postEvent(stripeEvent(
      'customer.subscription.deleted',
      cloverSubscription({ status: 'canceled' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expect(storedPeriodEnd()).toBeNull();
    assertNoInvalidDates();
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('free');
    expect((insert![1] as unknown[])[3]).toBe('canceled');
  });

  it('legacy subscription payloads still use the top-level period fields', async () => {
    const subscription = legacySubscription();
    expect(subscription.items.data[0]).not.toHaveProperty('current_period_end');
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2024-06-20',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), LEGACY_PERIOD_END);
    assertNoInvalidDates();
  });

  it('falls back to the legacy period when the item value is not a unix timestamp', async () => {
    const subscription = cloverSubscription({
      current_period_end: LEGACY_PERIOD_END,
      current_period_start: LEGACY_PERIOD_START,
      items: {
        object: 'list',
        data: [cloverItem({ end: 'not-a-timestamp', start: { bad: true } })],
      },
    });
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), LEGACY_PERIOD_END);
    assertNoInvalidDates();
  });

  it('stores null instead of an invalid Date when both period fields are missing or odd', async () => {
    const subscription = cloverSubscription({
      current_period_end: 'nope',
      current_period_start: { nope: true },
      items: {
        object: 'list',
        data: [cloverItem({ end: null, start: '' })],
      },
    });
    const res = await postEvent(stripeEvent(
      'customer.subscription.created',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expect(storedPeriodEnd()).toBeNull();
    assertNoInvalidDates();
  });

  it('accepts a numeric-string unix timestamp on the subscription item', async () => {
    const subscription = cloverSubscription({
      items: {
        object: 'list',
        data: [cloverItem({ end: String(ITEM_PERIOD_END), start: String(ITEM_PERIOD_START) })],
      },
    });
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    assertNoInvalidDates();
  });

  it('returns 200 when items are missing instead of 500', async () => {
    const subscription = {
      id: 'sub_test_no_items',
      object: 'subscription',
      customer: 'cus_test_period',
      status: 'active',
    };
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);
    assertNoInvalidDates();
  });

  it('acknowledges a missing customer instead of returning 500', async () => {
    mocks.customersRetrieve.mockRejectedValue(Object.assign(new Error('No such customer: cus_missing'), {
      type: 'StripeInvalidRequestError',
      statusCode: 404,
    }));
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription(),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    assertNoInvalidDates();
  });

  it('still returns 500 when the database write fails', async () => {
    mocks.q.mockRejectedValue(new Error('connection terminated'));
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription(),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
  });

  it('still returns 500 when Stripe cannot be reached', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());
    mocks.customersRetrieve.mockRejectedValue(new Error('socket hang up'));
    const res = await postEvent(stripeEvent(
      'checkout.session.completed',
      {
        id: 'cs_test_network',
        object: 'checkout.session',
        mode: 'subscription',
        customer: 'cus_test_period',
        subscription: 'sub_test_period',
      },
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
  });

  it('rejects a bad signature with 400 and does not write', async () => {
    const res = await postEvent(
      stripeEvent('customer.subscription.updated', cloverSubscription(), '2025-09-30.clover'),
      't=1,v1=deadbeef',
    );

    expect(res.status).toBe(400);
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 400', async () => {
    const res = await postEvent(
      stripeEvent('checkout.session.completed', { id: 'cs_test', object: 'checkout.session' }, '2025-09-30.clover'),
      null,
    );

    expect(res.status).toBe(400);
    expect(mocks.q).not.toHaveBeenCalled();
  });
});
