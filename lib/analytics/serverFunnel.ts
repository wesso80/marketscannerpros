import { createHash } from 'node:crypto';

const BLOCKED_PROP = /email|card|name|phone|address|customer|ip|user.?agent|password|secret/i;

export type PaidFunnelEvent = 'purchase' | 'paid';

export function checkoutRef(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
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

export function checkoutAlreadyRecorded(
  row: { stripe_subscription_id?: string | null; status?: string | null } | undefined,
  subscriptionId: string,
): boolean {
  if (!row?.stripe_subscription_id || !subscriptionId) return false;
  return row.stripe_subscription_id === subscriptionId
    && (row.status === 'active' || row.status === 'trialing' || row.status === 'past_due');
}

async function recordServerFunnelEvent(
  name: PaidFunnelEvent,
  props: Record<string, string | number | boolean>,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  console.info(JSON.stringify({ source: 'funnel', event: name, ...props }));
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
        properties: { ...props, $lib: 'msp-funnel' },
      }),
    });
    if (!response.ok) console.warn('[funnel] posthog capture failed', response.status);
    return response.ok;
  } catch (error) {
    console.warn('[funnel] posthog capture failed', error instanceof Error ? error.message : 'network');
    return false;
  }
}

/** Stripe checkout completed. Emits purchase and paid once per call, with no card or personal data. */
export async function recordPaidCheckout(
  props: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ events: PaidFunnelEvent[]; forwarded: boolean }> {
  const safe = safeFunnelProps(props);
  let forwarded = false;
  for (const event of ['purchase', 'paid'] as const) {
    forwarded = await recordServerFunnelEvent(event, safe, fetchImpl) || forwarded;
  }
  return { events: ['purchase', 'paid'], forwarded };
}
