import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutAlreadyRecorded, checkoutRef, recordPaidCheckout, safeFunnelProps } from '@/lib/analytics/serverFunnel';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('paid checkout funnel', () => {
  it('drops email, card and customer fields', () => {
    expect(safeFunnelProps({
      tier: 'pro',
      email: 'a@b.c',
      card_last4: '4242',
      customer: 'cus_123',
      amount_cents: 2499,
      billing: 'monthly',
      livemode: true,
    })).toEqual({ tier: 'pro', amount_cents: 2499, billing: 'monthly', livemode: true });
  });

  it('records a checkout once per subscription id', () => {
    expect(checkoutAlreadyRecorded({ stripe_subscription_id: 'sub_1', status: 'active' }, 'sub_1')).toBe(true);
    expect(checkoutAlreadyRecorded({ stripe_subscription_id: 'sub_1', status: 'active' }, 'sub_2')).toBe(false);
    expect(checkoutAlreadyRecorded({ stripe_subscription_id: null, status: 'active' }, 'sub_1')).toBe(false);
    expect(checkoutAlreadyRecorded(undefined, 'sub_1')).toBe(false);
  });

  it('logs purchase and paid without calling PostHog when the token is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchImpl = vi.fn();
    const result = await recordPaidCheckout({
      tier: 'pro',
      billing: 'monthly',
      currency: 'usd',
      amount_cents: 2499,
      email: 'a@b.c',
    }, fetchImpl);
    expect(result).toEqual({ events: ['purchase', 'paid'], forwarded: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    const lines = info.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines.map((line) => line.event)).toEqual(['purchase', 'paid']);
    expect(JSON.stringify(lines)).not.toContain('a@b.c');
  });

  it('posts purchase and paid to the existing PostHog host without card or email data', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const ref = checkoutRef('cs_test_secret');
    await recordPaidCheckout({
      tier: 'pro',
      billing: 'yearly',
      currency: 'usd',
      amount_cents: 24900,
      checkout_ref: ref,
      email: 'a@b.c',
      card: '4242',
    }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body) => body.event)).toEqual(['purchase', 'paid']);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://us.i.posthog.com/capture/');
    for (const body of bodies) {
      expect(JSON.stringify(body)).not.toMatch(/a@b\.c|4242|cs_test_secret/);
      expect(body.properties).toMatchObject({ tier: 'pro', billing: 'yearly', amount_cents: 24900, checkout_ref: ref });
      expect(body.api_key).toBe('phc_test');
    }
  });
});
