import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { subscriptionPeriodDate } from '@/lib/stripe/subscriptionPeriod';

const ITEM_PERIOD_END = 1682288167;
const ITEM_PERIOD_START = 1679609767;
const LEGACY_PERIOD_END = 1714000000;
const LEGACY_PERIOD_START = 1711321600;

function asSub(value: Record<string, unknown>): Stripe.Subscription {
  return value as unknown as Stripe.Subscription;
}

function cloverItem(period?: { end?: unknown; start?: unknown }) {
  const item: Record<string, unknown> = {
    id: 'si_test_period',
    object: 'subscription_item',
    quantity: 1,
    price: { id: 'price_test_pro_monthly', object: 'price' },
  };
  if (!period || !('end' in period)) item.current_period_end = ITEM_PERIOD_END;
  else if (period.end !== undefined) item.current_period_end = period.end;
  if (!period || !('start' in period)) item.current_period_start = ITEM_PERIOD_START;
  else if (period.start !== undefined) item.current_period_start = period.start;
  return item;
}

/** Subscription shape for API 2025-09-30.clover: periods live on the item only. */
function cloverSubscription(overrides: Record<string, unknown> = {}) {
  return asSub({
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
  });
}

function legacySubscription(overrides: Record<string, unknown> = {}) {
  return asSub({
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
          price: { id: 'price_test_pro_monthly', object: 'price' },
        },
      ],
      has_more: false,
      total_count: 1,
    },
    ...overrides,
  });
}

function expectUnixDate(value: Date | null, unixSeconds: number) {
  expect(value).toBeInstanceOf(Date);
  expect(Number.isNaN(value!.getTime())).toBe(false);
  expect(value!.toISOString()).toBe(new Date(unixSeconds * 1000).toISOString());
}

describe('subscriptionPeriodDate', () => {
  it('reads current_period_end from the subscription item on a clover payload', () => {
    const subscription = cloverSubscription();
    expect(subscription).not.toHaveProperty('current_period_end');
    expect(subscription).not.toHaveProperty('current_period_start');
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_end'), ITEM_PERIOD_END);
  });

  it('reads current_period_start from the subscription item on a clover payload', () => {
    expectUnixDate(subscriptionPeriodDate(cloverSubscription(), 'current_period_start'), ITEM_PERIOD_START);
  });

  it('prefers the item period over a legacy top-level value', () => {
    const subscription = cloverSubscription({
      current_period_end: LEGACY_PERIOD_END,
      current_period_start: LEGACY_PERIOD_START,
    });
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_end'), ITEM_PERIOD_END);
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_start'), ITEM_PERIOD_START);
  });

  it('reads period fields from the top-level subscription on a legacy payload', () => {
    const subscription = legacySubscription();
    expect(subscription.items.data[0]).not.toHaveProperty('current_period_end');
    expect(subscription.items.data[0]).not.toHaveProperty('current_period_start');
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_end'), LEGACY_PERIOD_END);
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_start'), LEGACY_PERIOD_START);
  });

  it('falls back to the legacy period when the item value is not a unix timestamp', () => {
    const subscription = cloverSubscription({
      current_period_end: LEGACY_PERIOD_END,
      current_period_start: LEGACY_PERIOD_START,
      items: {
        object: 'list',
        data: [cloverItem({ end: 'not-a-timestamp', start: { bad: true } })],
      },
    });
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_end'), LEGACY_PERIOD_END);
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_start'), LEGACY_PERIOD_START);
  });

  it('accepts a numeric-string unix timestamp on the subscription item', () => {
    const subscription = cloverSubscription({
      items: {
        object: 'list',
        data: [cloverItem({ end: String(ITEM_PERIOD_END), start: `  ${ITEM_PERIOD_START}  ` })],
      },
    });
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_end'), ITEM_PERIOD_END);
    expectUnixDate(subscriptionPeriodDate(subscription, 'current_period_start'), ITEM_PERIOD_START);
  });

  it('returns null when period fields are missing', () => {
    const noItems = asSub({
      id: 'sub_test_no_items',
      object: 'subscription',
      status: 'active',
    });
    expect(subscriptionPeriodDate(noItems, 'current_period_end')).toBeNull();
    expect(subscriptionPeriodDate(noItems, 'current_period_start')).toBeNull();

    const emptyItems = asSub({
      id: 'sub_test_empty_items',
      object: 'subscription',
      status: 'active',
      items: { object: 'list', data: [], has_more: false, total_count: 0 },
    });
    expect(subscriptionPeriodDate(emptyItems, 'current_period_end')).toBeNull();
    expect(subscriptionPeriodDate(emptyItems, 'current_period_start')).toBeNull();

    const itemWithoutPeriod = legacySubscription({
      current_period_end: undefined,
      current_period_start: undefined,
    });
    expect(subscriptionPeriodDate(itemWithoutPeriod, 'current_period_end')).toBeNull();
    expect(subscriptionPeriodDate(itemWithoutPeriod, 'current_period_start')).toBeNull();
  });

  it('returns null instead of an invalid Date when both fields are missing or odd', () => {
    const subscription = cloverSubscription({
      current_period_end: 'nope',
      current_period_start: { nope: true },
      items: {
        object: 'list',
        data: [cloverItem({ end: null, start: '' })],
      },
    });
    expect(subscriptionPeriodDate(subscription, 'current_period_end')).toBeNull();
    expect(subscriptionPeriodDate(subscription, 'current_period_start')).toBeNull();

    const overflow = cloverSubscription({
      items: {
        object: 'list',
        data: [cloverItem({ end: 1e20, start: Number.POSITIVE_INFINITY })],
      },
      current_period_end: Number.NaN,
      current_period_start: '   ',
    });
    expect(subscriptionPeriodDate(overflow, 'current_period_end')).toBeNull();
    expect(subscriptionPeriodDate(overflow, 'current_period_start')).toBeNull();
  });
});
