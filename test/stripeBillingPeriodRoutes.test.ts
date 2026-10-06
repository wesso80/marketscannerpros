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
let verifySessionToken: (token: string) => Record<string, unknown>;

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
    const auth = await import('../lib/auth');
    signSessionToken = auth.signSessionToken;
    verifySessionToken = auth.verifySessionToken;
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

  it('confirm does not restore Pro from a canceled subscription on a different id', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_current', status: 'past_due' }];
      }
      return [{ workspace_id: 'should-not-write' }];
    });
    const subscription = cloverSubscription();
    subscription.id = 'sub_old';
    subscription.status = 'canceled';
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_old',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-old@example.com' },
      subscription,
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_old'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('free');
    expect(insertCall()).toBeUndefined();
    const token = res.cookies.get('ms_auth')?.value;
    expect(token).toBeTruthy();
    expect(verifySessionToken(token!).tier).toBe('free');
  });

  it('confirm lets a live active subscription replace a different row and sets a paid cookie', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_old', status: 'active' }];
      }
      return [{ workspace_id: 'ws_new' }];
    });
    const subscription = cloverSubscription();
    subscription.id = 'sub_new';
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_new',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-new@example.com' },
      subscription,
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_new'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('pro');
    const insert = insertCall();
    expect(insert).toBeTruthy();
    expect(String(insert![0])).toContain("user_subscriptions.status NOT IN ('active', 'trialing', 'past_due', 'unpaid')");
    expect((insert![1] as unknown[])[5]).toBe('sub_new');
    expect((insert![1] as unknown[])[7]).toBe(true);
    expect(verifySessionToken(res.cookies.get('ms_auth')!.value).tier).toBe('pro');
  });

  it('confirm keeps the existing tier when an active subscription has an unknown price', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: 'sub_paid', status: 'active', tier: 'pro' }];
      }
      return [{ workspace_id: 'ws_confirm' }];
    });
    const subscription = cloverSubscription();
    subscription.items.data[0].price = { id: 'price_unknown' };
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_unknown',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-unknown@example.com' },
      subscription,
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_unknown'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe('pro');
    const insert = insertCall();
    expect(String(insert![0])).toContain("WHEN EXCLUDED.tier = 'free' AND EXCLUDED.status IN ('active', 'trialing', 'past_due')");
    expect(String(insert![0])).toContain('THEN user_subscriptions.tier');
    expect((insert![1] as unknown[])[2]).toBe('free');
    expect((insert![1] as unknown[])[3]).toBe('active');
    expect(verifySessionToken(res.cookies.get('ms_auth')!.value).tier).toBe('pro');
  });

  it('confirm does not let a canceled session overwrite a manual Pro grant', async () => {
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT stripe_subscription_id')) {
        return [{ stripe_subscription_id: null, status: 'active', tier: 'pro' }];
      }
      return [{ workspace_id: 'should-not-write' }];
    });
    const subscription = cloverSubscription();
    subscription.id = 'sub_old';
    subscription.status = 'canceled';
    mocks.sessionsRetrieve.mockResolvedValue({
      id: 'cs_manual',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      customer_details: { email: 'confirm-manual@example.com' },
      subscription,
    });

    const res = await confirmGET(new NextRequest('https://example.test/api/stripe/confirm?session_id=cs_manual'));
    expect(res.status).toBe(200);
    expect(insertCall()).toBeUndefined();
    expect((await res.json()).tier).toBe('free');
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
    const failure = Object.assign(new Error('invalid input syntax for type timestamp'), {
      code: '22007',
      email: 'paid-fail@example.com',
    });
    mocks.q.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('INSERT INTO user_subscriptions')) {
        throw failure;
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
    const trackLogs = errSpy.mock.calls.filter((call) => String(call[0]).includes('[login] Track subscription failed:'));
    expect(trackLogs).toHaveLength(1);
    expect(trackLogs[0][1]).toEqual({ message: 'invalid input syntax for type timestamp', code: '22007' });
    expect(JSON.stringify(trackLogs[0])).not.toContain('paid-fail@example.com');
    expect(JSON.stringify(trackLogs[0])).not.toContain('stack');
    errSpy.mockRestore();
  });
});
