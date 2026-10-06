import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ITEM_PERIOD_END = 1682288167;
const LEGACY_PERIOD_END = 1714000000;

const mocks = vi.hoisted(() => ({
  q: vi.fn(async () => [] as unknown[]),
  list: vi.fn(),
  requireAdmin: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/db', () => ({
  q: (...args: unknown[]) => mocks.q(...args),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: (...args: unknown[]) => mocks.requireAdmin(...args),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { list: (...args: unknown[]) => mocks.list(...args) },
    products: { retrieve: vi.fn() },
  },
}));

import { POST } from '@/app/api/admin/sync-stripe/route';

function customer() {
  return { id: 'cus_test_sync', object: 'customer', email: 'Sync@Test.example.com' };
}

function cloverSubscription() {
  return {
    id: 'sub_test_clover',
    object: 'subscription',
    customer: customer(),
    status: 'active',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_clover',
          object: 'subscription_item',
          quantity: 1,
          current_period_end: ITEM_PERIOD_END,
          current_period_start: 1679609767,
          price: { id: 'price_test_unused', object: 'price' },
        },
      ],
      has_more: false,
      total_count: 1,
    },
  };
}

function legacySubscription() {
  return {
    id: 'sub_test_legacy',
    object: 'subscription',
    customer: customer(),
    status: 'active',
    current_period_end: LEGACY_PERIOD_END,
    current_period_start: 1711321600,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_legacy',
          object: 'subscription_item',
          quantity: 1,
          price: { id: 'price_test_unused', object: 'price' },
        },
      ],
      has_more: false,
      total_count: 1,
    },
  };
}

function subscriptionWithoutPeriod() {
  return {
    id: 'sub_test_missing',
    object: 'subscription',
    customer: customer(),
    status: 'active',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_missing',
          object: 'subscription_item',
          quantity: 1,
          price: { id: 'price_test_unused', object: 'price' },
        },
      ],
      has_more: false,
      total_count: 1,
    },
  };
}

function listOf(sub: Record<string, unknown>) {
  mocks.list.mockResolvedValue({ object: 'list', data: [sub], has_more: false });
}

async function sync() {
  return POST(new NextRequest('https://example.test/api/admin/sync-stripe', { method: 'POST' }));
}

function storedPeriodEnd(): unknown {
  const insert = mocks.q.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_subscriptions'));
  expect(insert, 'expected an upsert into user_subscriptions').toBeTruthy();
  return (insert![1] as unknown[])[6];
}

function expectUnixDate(value: unknown, unixSeconds: number) {
  expect(value).toBeInstanceOf(Date);
  expect(Number.isNaN((value as Date).getTime())).toBe(false);
  expect((value as Date).toISOString()).toBe(new Date(unixSeconds * 1000).toISOString());
}

describe('POST /api/admin/sync-stripe period end', () => {
  beforeEach(() => {
    mocks.q.mockReset();
    mocks.q.mockResolvedValue([]);
    mocks.list.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireAdmin.mockResolvedValue({ ok: true });
  });

  it('writes current_period_end from the subscription item on a clover payload', async () => {
    const subscription = cloverSubscription();
    expect(subscription).not.toHaveProperty('current_period_end');
    listOf(subscription);

    const res = await sync();

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), ITEM_PERIOD_END);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('writes current_period_end from the top-level field on a legacy payload', async () => {
    const subscription = legacySubscription();
    expect(subscription.items.data[0]).not.toHaveProperty('current_period_end');
    listOf(subscription);

    const res = await sync();

    expect(res.status).toBe(200);
    expectUnixDate(storedPeriodEnd(), LEGACY_PERIOD_END);
  });

  it('writes null when period fields are missing and never an invalid Date', async () => {
    listOf(subscriptionWithoutPeriod());

    const res = await sync();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(storedPeriodEnd()).toBeNull();
    for (const call of mocks.q.mock.calls) {
      const params = call[1];
      if (!Array.isArray(params)) continue;
      for (const value of params) {
        if (value instanceof Date) {
          expect(Number.isNaN(value.getTime())).toBe(false);
        }
      }
    }
  });
});
