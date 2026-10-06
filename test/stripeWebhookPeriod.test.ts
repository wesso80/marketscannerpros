import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = 'whsec_test_period_end';
const PRICE_ID = 'price_test_pro_monthly';
const ITEM_PERIOD_END = 1682288167;
const ITEM_PERIOD_START = 1679609767;
const LEGACY_PERIOD_END = 1714000000;
const LEGACY_PERIOD_START = 1711321600;
const BASIL_PERIOD_END = 1700000000;
const BASIL_PERIOD_START = 1697408000;
const BASIL_API_VERSION = '2025-08-27.basil';

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
let invalidRequest: (code?: string) => Error;

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

/** Subscription shape for API 2025-08-27.basil: periods live on the item, not the subscription. */
function basilSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_basil',
    object: 'subscription',
    customer: 'cus_test_period',
    status: 'active',
    items: {
      object: 'list',
      data: [cloverItem({
        end: BASIL_PERIOD_END,
        start: BASIL_PERIOD_START,
        priceId: PRICE_ID,
      })],
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

function stripeEvent(type: string, object: Record<string, unknown>, apiVersion: string, id?: string) {
  return {
    id: id ?? `evt_test_${type.replaceAll('.', '_')}`,
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
    invalidRequest = (code?: string) => new Stripe.errors.StripeInvalidRequestError({
      message: 'No such customer',
      code,
      type: 'invalid_request_error',
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
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('active');
  });

  it('checkout.session.completed still writes tier and status when the period is missing', async () => {
    const subscription = cloverSubscription({
      items: {
        object: 'list',
        data: [cloverItem({ end: undefined, start: undefined })],
      },
    });
    delete (subscription.items.data[0] as { current_period_end?: unknown }).current_period_end;
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);

    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_test_no_period',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
    }, '2025-09-30.clover'));

    expect(res.status).toBe(200);
    expect(storedPeriodEnd()).toBeNull();
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('active');
    assertNoInvalidDates();
  });

  it('customer.subscription.created reads the item period when the top-level field is absent', async () => {
    const subscription = cloverSubscription({ status: 'trialing' });
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
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
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
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
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
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
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
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
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
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
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    assertNoInvalidDates();
  });

  it('returns 500 when items are missing', async () => {
    const subscription = {
      id: 'sub_test_no_items',
      object: 'subscription',
      customer: 'cus_test_period',
      status: 'active',
    };
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
  });

  it('returns 500 when the customer lookup fails', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());
    mocks.customersRetrieve.mockRejectedValue(invalidRequest('resource_missing'));
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription(),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('returns 500 when checkout subscription retrieve fails', async () => {
    mocks.subscriptionsRetrieve.mockRejectedValue(invalidRequest('resource_missing'));
    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_test_mismatch',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
    }, '2025-09-30.clover'));

    expect(res.status).toBe(500);
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('still upserts tier and status when the period fields are absent', async () => {
    const subscription = cloverSubscription({
      items: {
        object: 'list',
        data: [cloverItem({ end: undefined, start: undefined })],
      },
    });
    delete (subscription.items.data[0] as { current_period_end?: unknown }).current_period_end;
    delete (subscription.items.data[0] as { current_period_start?: unknown }).current_period_start;
    expect(subscription).not.toHaveProperty('current_period_end');
    expect(subscription.items.data[0]).not.toHaveProperty('current_period_end');
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expect(storedPeriodEnd()).toBeNull();
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('active');
    assertNoInvalidDates();
  });

  it('returns 500 when the upsert throws a TypeError', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());
    mocks.q.mockRejectedValue(new TypeError('cannot read period column'));
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription(),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
  });

  it('acknowledges customer.subscription.deleted only when Stripe says resource_missing', async () => {
    mocks.customersRetrieve.mockRejectedValue(invalidRequest('resource_missing'));
    const res = await postEvent(stripeEvent(
      'customer.subscription.deleted',
      cloverSubscription({ status: 'canceled' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const cancel = mocks.q.mock.calls.find((call) => String(call[0]).includes("tier = 'free'") && String(call[0]).includes('stripe_subscription_id = $1'));
    expect(cancel).toBeTruthy();
    expect((cancel![1] as unknown[])[0]).toBe('sub_test_period');
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
  });

  it('returns 500 when customer.subscription.deleted fails for another Stripe error', async () => {
    mocks.customersRetrieve.mockRejectedValue(invalidRequest('lock_timeout'));
    const res = await postEvent(stripeEvent(
      'customer.subscription.deleted',
      cloverSubscription({ status: 'canceled' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(500);
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('invoice.payment_failed reads the subscription id from parent.subscription_details', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ status: 'past_due' }));
    const res = await postEvent(stripeEvent('invoice.payment_failed', {
      id: 'in_test_clover',
      object: 'invoice',
      customer: 'cus_test_period',
      parent: {
        type: 'subscription_details',
        quote_details: null,
        subscription_details: { subscription: 'sub_from_parent', metadata: null },
      },
      subscription: 'sub_legacy_should_not_win',
    }, '2025-09-30.clover'));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_from_parent');
    const update = mocks.q.mock.calls.find((call) => String(call[0]).includes("status = 'past_due'"));
    expect(update).toBeTruthy();
  });

  it('invoice.payment_failed falls back to the legacy invoice.subscription field', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ status: 'unpaid' }));
    const res = await postEvent(stripeEvent('invoice.payment_failed', {
      id: 'in_test_legacy',
      object: 'invoice',
      customer: 'cus_test_period',
      subscription: 'sub_legacy',
    }, '2024-06-20'));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_legacy');
    const update = mocks.q.mock.calls.find((call) => String(call[0]).includes("status = 'past_due'"));
    expect(update).toBeTruthy();
  });

  it('still returns 500 when the database write fails', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());
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

  it('a replayed active event upserts the live canceled subscription', async () => {
    const stale = cloverSubscription({ id: 'sub_old', status: 'active' });
    const live = cloverSubscription({ id: 'sub_old', status: 'canceled' });
    mocks.subscriptionsRetrieve.mockResolvedValue(live);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      stale,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_old');
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(String(insert![0])).toContain("user_subscriptions.status NOT IN ('active', 'trialing', 'past_due', 'unpaid')");
    expect(String(insert![0])).toContain("EXCLUDED.status IN ('active', 'trialing')");
    expect(String(insert![0])).toContain("WHEN EXCLUDED.tier = 'free'");
    expect((insert![1] as unknown[])[3]).toBe('canceled');
    expect((insert![1] as unknown[])[4]).toBe('sub_old');
  });

  it('does not overwrite an active row with a different subscription id', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_current', status: 'active' }];
      }
      return [];
    });
    const stale = cloverSubscription({ id: 'sub_old', status: 'canceled' });
    mocks.subscriptionsRetrieve.mockResolvedValue(stale);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      { ...stale, status: 'active' },
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
  });

  it('invoice.payment_failed writes nothing when the live subscription is active', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ status: 'active' }));
    const res = await postEvent(stripeEvent('invoice.payment_failed', {
      id: 'in_test_active',
      object: 'invoice',
      customer: 'cus_test_period',
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_test_period' },
      },
    }, '2025-09-30.clover'));

    expect(res.status).toBe(200);
    const update = mocks.q.mock.calls.find((call) => String(call[0]).includes("status = 'past_due'"));
    expect(update).toBeUndefined();
  });

  it('a deleted customer writes nothing and returns 200', async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());
    mocks.customersRetrieve.mockResolvedValue({ id: 'cus_gone', object: 'customer', deleted: true });
    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription({ status: 'active' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
  });

  it('a duplicate event id runs the welcome email once', async () => {
    let claims = 0;
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('stripe_processed_events')) {
        claims += 1;
        return claims === 1 ? [{ event_id: 'evt_test_checkout_session_completed' }] : [];
      }
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        return [{ workspace_id: 'ws_test' }];
      }
      return [];
    });
    const subscription = cloverSubscription();
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
    const event = stripeEvent('checkout.session.completed', {
      id: 'cs_test_once',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
    }, '2025-09-30.clover');

    const first = await postEvent(event);
    const second = await postEvent(event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    const inserts = mocks.q.mock.calls.filter((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(inserts).toHaveLength(2);
  });

  it('checkout.session.completed reads a basil payload and stores the clover retrieve period', async () => {
    const cloverLive = cloverSubscription({ id: 'sub_test_basil', status: 'trialing' });
    expect(cloverLive).not.toHaveProperty('current_period_end');
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverLive);

    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_test_basil',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_basil',
      status: 'complete',
      payment_status: 'paid',
      metadata: {},
    }, BASIL_API_VERSION));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_test_basil');
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('trialing');
    assertNoInvalidDates();
  });

  it('customer.subscription.updated reads a basil payload and stores the clover retrieve', async () => {
    const basilEvent = basilSubscription({ status: 'active' });
    expect(basilEvent).not.toHaveProperty('current_period_end');
    const cloverLive = cloverSubscription({
      id: 'sub_test_basil',
      status: 'past_due',
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverLive);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      basilEvent,
      BASIL_API_VERSION,
    ));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_test_basil');
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[3]).toBe('past_due');
    expect((insert![1] as unknown[])[4]).toBe('sub_test_basil');
    assertNoInvalidDates();
  });

  it('invoice.payment_failed reads the subscription id from a basil invoice', async () => {
    const basilInvoice = {
      id: 'in_test_basil',
      object: 'invoice',
      customer: 'cus_test_period',
      parent: {
        type: 'subscription_details',
        quote_details: null,
        subscription_details: { subscription: 'sub_test_basil', metadata: null },
      },
    };
    expect(basilInvoice).not.toHaveProperty('subscription');
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({
      id: 'sub_test_basil',
      status: 'past_due',
    }));

    const res = await postEvent(stripeEvent('invoice.payment_failed', basilInvoice, BASIL_API_VERSION));

    expect(res.status).toBe(200);
    expect(mocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_test_basil');
    const update = mocks.q.mock.calls.find((call) => String(call[0]).includes("status = 'past_due'"));
    expect(update).toBeTruthy();
    expect((update![1] as unknown[])[1]).toBe('sub_test_basil');
  });

  it('an unknown price on an active subscription keeps the existing tier and logs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const subscription = cloverSubscription({
      id: 'sub_unknown_price',
      status: 'active',
      items: {
        object: 'list',
        data: [cloverItem({ priceId: 'price_unknown' })],
        has_more: false,
        total_count: 1,
      },
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(String(insert![0])).toContain("WHEN EXCLUDED.tier = 'free' AND EXCLUDED.status IN ('active', 'trialing', 'past_due')");
    expect(String(insert![0])).toContain('THEN user_subscriptions.tier');
    expect((insert![1] as unknown[])[2]).toBe('free');
    expect((insert![1] as unknown[])[3]).toBe('active');
    expect(errSpy.mock.calls.some((call) => {
      const line = String(call[0]);
      return line.includes('sub_unknown_price') && line.includes('price_unknown') && line.includes('keeping the existing tier');
    })).toBe(true);
    errSpy.mockRestore();
  });

  it('maps the tier from every subscription item', async () => {
    const subscription = cloverSubscription({
      items: {
        object: 'list',
        data: [
          cloverItem({ priceId: 'price_unknown' }),
          cloverItem({ priceId: PRICE_ID }),
        ],
        has_more: false,
        total_count: 2,
      },
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      subscription,
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect((insert![1] as unknown[])[2]).toBe('pro');
  });

  it('customer.subscription.deleted cancels by subscription id when the customer is deleted', async () => {
    mocks.customersRetrieve.mockResolvedValue({ id: 'cus_gone', object: 'customer', deleted: true });
    const res = await postEvent(stripeEvent(
      'customer.subscription.deleted',
      cloverSubscription({ id: 'sub_deleted_customer', status: 'canceled' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
    const cancel = mocks.q.mock.calls.find((call) => String(call[0]).includes("tier = 'free'") && String(call[0]).includes('stripe_subscription_id = $1'));
    expect(cancel).toBeTruthy();
    expect((cancel![1] as unknown[])[0]).toBe('sub_deleted_customer');
  });

  it('does not let a stale canceled subscription replace a newer past_due row', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_new', status: 'past_due' }];
      }
      return [];
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ id: 'sub_old', status: 'canceled' }));

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription({ id: 'sub_old', status: 'active' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
  });

  it('a live active subscription replaces a different active row', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_old', status: 'active' }];
      }
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        return [{ workspace_id: 'ws_new' }];
      }
      return [];
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ id: 'sub_new', status: 'active' }));

    const res = await postEvent(stripeEvent(
      'customer.subscription.updated',
      cloverSubscription({ id: 'sub_old', status: 'active' }),
      '2025-09-30.clover',
    ));

    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeTruthy();
    expect((insert![1] as unknown[])[3]).toBe('active');
    expect((insert![1] as unknown[])[4]).toBe('sub_new');
  });

  it('does not send the welcome email when the upsert is skipped', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_current', status: 'past_due' }];
      }
      return [{ workspace_id: 'should-not-matter' }];
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription({ id: 'sub_old', status: 'canceled' }));

    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_skipped',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_old',
      status: 'complete',
    }, '2025-09-30.clover', 'evt_checkout_skipped'));

    expect(res.status).toBe(200);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
    const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
    expect(insert).toBeUndefined();
  });

  it('dedupes side effects in memory when the processed-events table is missing', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('stripe_processed_events')) {
        const missing = new Error('relation "stripe_processed_events" does not exist') as Error & { code: string };
        missing.code = '42P01';
        throw missing;
      }
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        return [{ workspace_id: 'ws_test' }];
      }
      return [];
    });
    const subscription = cloverSubscription();
    mocks.subscriptionsRetrieve.mockResolvedValue(subscription);
    const event = stripeEvent('checkout.session.completed', {
      id: 'cs_42p01',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
    }, '2025-09-30.clover', 'evt_42p01_once');

    const first = await postEvent(event);
    const second = await postEvent(event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when recording a processed event fails for a reason other than a missing table', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('stripe_processed_events')) {
        const err = new Error('relation "stripe_processed_events" does not exist') as Error & { code?: string };
        err.code = '08006';
        throw err;
      }
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        return [{ workspace_id: 'ws_test' }];
      }
      return [];
    });
    mocks.subscriptionsRetrieve.mockResolvedValue(cloverSubscription());

    const res = await postEvent(stripeEvent('checkout.session.completed', {
      id: 'cs_db_error',
      object: 'checkout.session',
      mode: 'subscription',
      customer: 'cus_test_period',
      subscription: 'sub_test_period',
      status: 'complete',
    }, '2025-09-30.clover', 'evt_processed_db_error'));

    expect(res.status).toBe(500);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
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
