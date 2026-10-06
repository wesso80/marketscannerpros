import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const PRICE_ID = 'price_test_pro_monthly';
const ITEM_PERIOD_END = 1682288167;

const mocks = vi.hoisted(() => ({
  q: vi.fn(async () => [] as unknown[]),
  sessionsRetrieve: vi.fn(),
  customersList: vi.fn(),
  customersUpdate: vi.fn(),
  subscriptionsList: vi.fn(),
  sendNewSignupNotification: vi.fn(async () => undefined),
}));

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_billing_period';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_pro_monthly';
});

vi.mock('@/lib/db', () => ({
  q: (...args: unknown[]) => mocks.q(...args),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: (...args: unknown[]) => mocks.sessionsRetrieve(...args) } },
    customers: {
      list: (...args: unknown[]) => mocks.customersList(...args),
      update: (...args: unknown[]) => mocks.customersUpdate(...args),
    },
    subscriptions: { list: (...args: unknown[]) => mocks.subscriptionsList(...args) },
  },
}));

vi.mock('@/lib/email', () => ({
  sendNewSignupNotification: (...args: unknown[]) => mocks.sendNewSignupNotification(...args),
}));

let confirmGET: (req: NextRequest) => Promise<Response>;
let loginPOST: (req: NextRequest) => Promise<Response>;
let signSessionToken: (payload: object) => string;

function cloverSubscription(options?: { omitPeriod?: boolean }) {
  const item: Record<string, unknown> = {
    id: 'si_login',
    price: { id: PRICE_ID },
    current_period_start: 1679609767,
  };
  if (!options?.omitPeriod) item.current_period_end = ITEM_PERIOD_END;
  return {
    id: 'sub_paid',
    status: 'active',
    items: { data: [item] },
  };
}

function insertCall() {
  return mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
}

describe('clover period fields on the paid signup paths', () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_billing_period';
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = PRICE_ID;
    confirmGET = (await import('../app/api/stripe/confirm/route')).GET;
    loginPOST = (await import('../app/api/auth/login/route')).POST;
    signSessionToken = (await import('../lib/auth')).signSessionToken;
  });

  beforeEach(() => {
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
    mocks.sessionsRetrieve.mockReset();
    mocks.customersList.mockReset();
    mocks.customersUpdate.mockReset();
    mocks.customersUpdate.mockResolvedValue({});
    mocks.subscriptionsList.mockReset();
    mocks.sendNewSignupNotification.mockReset();
    mocks.sendNewSignupNotification.mockResolvedValue(undefined);
  });

  it('confirm stores the item period and still writes the paid tier', async () => {
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_test',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm@example.com' },
      subscription: cloverSubscription(),
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_test'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('pro');
    const insert = insertCall();
    expect(insert).toBeTruthy();
    const params = insert![1] as unknown[];
    expect(params[2]).toBe('pro');
    expect(params[3]).toBe('active');
    expect(params[6]).toBeInstanceOf(Date);
    expect(Number.isNaN((params[6] as Date).getTime())).toBe(false);
    expect((params[6] as Date).toISOString()).toBe(new Date(ITEM_PERIOD_END * 1000).toISOString());
  });

  it('confirm stores null and still writes the paid tier when the period is absent', async () => {
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_test_null',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-null@example.com' },
      subscription: cloverSubscription({ omitPeriod: true }),
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_test_null'));
    expect(res.status).toBe(200);
    const insert = insertCall();
    expect((insert![1] as unknown[])[2]).toBe('pro');
    expect((insert![1] as unknown[])[3]).toBe('active');
    expect((insert![1] as unknown[])[6]).toBeNull();
  });

  it('confirm stores a trialing subscription as trialing', async () => {
    const subscription = cloverSubscription();
    subscription.status = 'trialing';
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_test_trial',
      status: 'complete',
      payment_status: 'no_payment_required',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-trial@example.com' },
      subscription,
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_test_trial'));
    expect(res.status).toBe(200);
    expect((insertCall()![1] as unknown[])[3]).toBe('trialing');
  });

  it('confirm returns 500 when the subscription write fails', async () => {
    mocks.q.mockRejectedValue(new Error('connection terminated'));
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_test_db',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-db@example.com' },
      subscription: cloverSubscription(),
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_test_db'));
    expect(res.status).toBe(500);
    expect(errSpy.mock.calls.some((call) => String(call[0]).includes('[stripe/confirm] DB error:'))).toBe(true);
    errSpy.mockRestore();
  });

  it('login stores the item period without failing the sign-in', async () => {
    mocks.customersList.mockResolvedValue({ data: [{ id: 'cus_login', email: 'paid@example.com' }] });
    mocks.subscriptionsList.mockResolvedValue({ data: [cloverSubscription()] });
    const loginNonce = signSessionToken({
      purpose: 'login_nonce',
      email: 'paid@example.com',
      exp: Math.floor(Date.now() / 1000) + 120,
    });

    const res = await loginPOST(new NextRequest('https://example.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ email: 'paid@example.com', loginNonce }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('pro');
    const insert = insertCall();
    expect(insert).toBeTruthy();
    const params = insert![1] as unknown[];
    expect(params[2]).toBe('pro');
    expect(params[3]).toBe('active');
    expect((params[6] as Date).toISOString()).toBe(new Date(ITEM_PERIOD_END * 1000).toISOString());
  });

  it('login still signs the user in and logs when the subscription upsert fails', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        throw new Error('invalid input syntax for type timestamp');
      }
      return [];
    });
    mocks.customersList.mockResolvedValue({ data: [{ id: 'cus_login', email: 'paid-fail@example.com' }] });
    mocks.subscriptionsList.mockResolvedValue({ data: [cloverSubscription()] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loginNonce = signSessionToken({
      purpose: 'login_nonce',
      email: 'paid-fail@example.com',
      exp: Math.floor(Date.now() / 1000) + 120,
    });

    const res = await loginPOST(new NextRequest('https://example.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
      body: JSON.stringify({ email: 'ignored@example.com', loginNonce }),
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('pro');
    expect(errSpy.mock.calls.some((call) => String(call[0]).includes('[login] Track subscription failed:'))).toBe(true);
    errSpy.mockRestore();
  });
});
