import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutRef, paidEventId, recordPaidCheckout, safeFunnelProps } from '@/lib/analytics/serverFunnel';

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

  it('still sends once when the subscription row is already active', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await recordPaidCheckout({
      tier: 'pro',
      payment_status: 'paid',
      subscription_status: 'active',
      billing: 'monthly',
      currency: 'usd',
      amount_cents: 2499,
      checkout_session_id: 'cs_already_active',
      checkout_ref: checkoutRef('cs_already_active'),
    }, fetchImpl as unknown as typeof fetch);
    expect(result.events).toEqual(['purchase', 'paid']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body) => body.event)).toEqual(['purchase', 'paid']);
    expect(JSON.stringify(bodies)).not.toContain('active');
    expect(bodies[0].uuid).toBe(paidEventId('cs_already_active', 'purchase'));
    expect(bodies[0].properties.$insert_id).toBe(bodies[0].uuid);
  });

  it('reuses the same event id when the same checkout session is delivered twice', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    const send = () => {
      const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
      return recordPaidCheckout({
        tier: 'pro',
        payment_status: 'paid',
        checkout_session_id: 'cs_retry',
        amount_cents: 2499,
      }, fetchImpl as unknown as typeof fetch).then(() => fetchImpl);
    };
    const first = await send();
    const second = await send();
    const ids = (impl: ReturnType<typeof vi.fn>) => impl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).uuid);
    expect(ids(first)).toEqual(ids(second));
    expect(ids(first)).toEqual([paidEventId('cs_retry', 'purchase'), paidEventId('cs_retry', 'paid')]);
    expect(new Set(ids(first)).size).toBe(2);
  });

  it('does not send an unpaid checkout session', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await recordPaidCheckout({
      tier: 'pro',
      payment_status: 'unpaid',
      subscription_status: 'active',
      checkout_session_id: 'cs_unpaid',
      amount_cents: 0,
    }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ events: [], forwarded: false });
    expect(fetchImpl).not.toHaveBeenCalled();
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
