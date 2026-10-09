import { describe, expect, it, vi } from 'vitest';
import { chooseAccessSubscription, chooseStripeCustomerId, rowsBlockTrial, tierForUnmappedLiveSubscription } from '@/lib/subscriptionRow';

const NOW = Date.parse('2026-10-09T00:00:00.000Z');
const FUTURE = '2026-11-01T00:00:00.000Z';

describe('duplicate user_subscriptions rows', () => {
  it('picks a cus_ id over a newer free row', () => {
    expect(chooseStripeCustomerId([
      { stripe_customer_id: null, updated_at: '2026-10-09T00:00:00.000Z', id: 2 },
      { stripe_customer_id: 'cus_PaidUser1', updated_at: '2026-01-01T00:00:00.000Z', id: 1 },
    ])).toBe('cus_PaidUser1');
  });

  it('gives Pro when a free row sits beside an active pro_trader row', async () => {
    const free = {
      email: 'member@example.test',
      tier: 'free',
      status: 'active',
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      updated_at: '2026-10-09T00:00:00.000Z',
      id: 2,
    };
    const paid = {
      email: 'member@example.test',
      tier: 'pro_trader',
      status: 'active',
      current_period_end: FUTURE,
      stripe_customer_id: 'cus_PaidUser1',
      stripe_subscription_id: 'sub_PaidUser1',
      updated_at: '2026-01-01T00:00:00.000Z',
      id: 1,
    };
    expect(chooseAccessSubscription([free], [paid], NOW)?.tier).toBe('pro_trader');

    const { getEffectiveTier } = await import('@/lib/entitlements');
    const dbQuery = vi.fn(async (sql: string) => {
      if (sql.includes('workspace_id')) return [free];
      if (sql.includes('LOWER(email)')) return [free, paid];
      return [];
    });
    await expect(getEffectiveTier('ws-free', 'free', 'free_member@example.test', dbQuery)).resolves.toBe('pro_trader');
  });

  it('does not treat a sibling pro row without Stripe ids as paid access', () => {
    const free = { tier: 'free', status: 'active', stripe_customer_id: null, stripe_subscription_id: null, id: 1 };
    const sibling = { tier: 'pro_trader', status: 'active', stripe_customer_id: null, stripe_subscription_id: null, updated_at: '2026-10-09T00:00:00.000Z', id: 2 };
    expect(chooseAccessSubscription([free], [sibling], NOW)?.tier).toBe('free');
  });

  it('blocks a trial when only the second row has Stripe ids', () => {
    expect(rowsBlockTrial([
      { stripe_customer_id: null, stripe_subscription_id: null, is_trial: false, status: 'active' },
      { stripe_customer_id: 'cus_PaidUser1', stripe_subscription_id: 'sub_PaidUser1', is_trial: false, status: 'active' },
    ])).toBe(true);
    expect(rowsBlockTrial([
      { stripe_customer_id: null, stripe_subscription_id: null, is_trial: false, status: 'active' },
    ])).toBe(false);
  });

  it('keeps pro_trader or defaults to pro for an unmapped live price', () => {
    expect(tierForUnmappedLiveSubscription(['free', 'pro_trader'])).toBe('pro_trader');
    expect(tierForUnmappedLiveSubscription(['free', 'pro'])).toBe('pro');
    expect(tierForUnmappedLiveSubscription([])).toBe('pro');
  });
});
