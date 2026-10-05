import { createHash } from 'node:crypto';

const BLOCKED_PROP = /email|card|name|phone|address|customer|ip|user.?agent|password|secret/i;

export type PaidFunnelEvent = 'purchase' | 'paid';

export function checkoutRef(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

/** Paid checkout only. The subscription row is not an input: it is often already active before this webhook. */
export function shouldSendPaidCheckout(input: { paymentStatus?: string | null; tier?: string | null }): boolean {
  return input.paymentStatus === 'paid' && (input.tier === 'pro' || input.tier === 'pro_trader');
}

/**
 * One PostHog id per checkout session and event name.
 * The seed is `checkout:<session id>` plus the event name, so a retry matches
 * and `purchase` does not collide with `paid`.
 */
export function paidEventId(sessionId: string, name: PaidFunnelEvent): string {
  const hex = createHash('sha256').update(`checkout:${sessionId}:${name}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Drops card data, email and other personal fields before a funnel event is logged or forwarded. */
export function safeFunnelProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (BLOCKED_PROP.test(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 80);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

async function recordServerFunnelEvent(
  name: PaidFunnelEvent,
  props: Record<string, string | number | boolean>,
  eventId: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  console.info(JSON.stringify({ source: 'funnel', event: name, event_id: eventId, ...props }));
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return false;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  const distinct = typeof props.checkout_ref === 'string' ? `paid_${props.checkout_ref}` : 'paid_checkout';
  try {
    const response = await fetchImpl(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: token,
        event: name,
        distinct_id: distinct,
        uuid: eventId,
        properties: { ...props, $lib: 'msp-funnel', $insert_id: eventId },
      }),
    });
    if (!response.ok) console.warn('[funnel] posthog capture failed', response.status);
    return response.ok;
  } catch (error) {
    console.warn('[funnel] posthog capture failed', error instanceof Error ? error.message : 'network');
    return false;
  }
}

const CHECKOUT_CONTROL_PROPS = new Set(['payment_status', 'subscription_status', 'checkout_session_id']);

/** Stripe checkout completed. Emits purchase and paid for a paid session, with no card or personal data. */
export async function recordPaidCheckout(
  props: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ events: PaidFunnelEvent[]; forwarded: boolean }> {
  const paymentStatus = typeof props.payment_status === 'string' ? props.payment_status : 'paid';
  const tier = typeof props.tier === 'string' ? props.tier : '';
  if (!shouldSendPaidCheckout({ paymentStatus, tier })) return { events: [], forwarded: false };
  const sessionId = typeof props.checkout_session_id === 'string' ? props.checkout_session_id : '';
  const forwardedProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!CHECKOUT_CONTROL_PROPS.has(key)) forwardedProps[key] = value;
  }
  const safe = safeFunnelProps(forwardedProps);
  let forwarded = false;
  for (const event of ['purchase', 'paid'] as const) {
    forwarded = await recordServerFunnelEvent(event, safe, paidEventId(sessionId, event), fetchImpl) || forwarded;
  }
  return { events: ['purchase', 'paid'], forwarded };
}
