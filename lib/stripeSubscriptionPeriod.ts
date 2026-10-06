/**
 * Billing fields that moved in Stripe API 2025-03-31.basil.
 *
 * The live webhook endpoint sends 2025-08-27.basil payloads. The client that
 * retrieves subscriptions is pinned to 2025-09-30.clover, so a retrieved
 * object can differ from the event snapshot. Both shapes put the period on
 * the subscription item and the invoice's subscription id on
 * parent.subscription_details. Older events still use the top-level fields.
 * Read the new location first, then the legacy one. Never build an Invalid Date.
 */

function unixSecondsToDate(value: unknown): Date | null {
  let seconds: number;
  if (typeof value === 'number') {
    seconds = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    seconds = Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/** Item period first, then the legacy top-level field, then null. Never an Invalid Date. */
export function subscriptionPeriodDate(
  subscription: unknown,
  field: 'current_period_end' | 'current_period_start',
): Date | null {
  if (!subscription || typeof subscription !== 'object') return null;
  const sub = subscription as {
    items?: { data?: Array<Record<string, unknown> | null> | null } | null;
  } & Record<string, unknown>;
  const item = sub.items?.data?.[0];
  const fromItem = unixSecondsToDate(item?.[field]);
  if (fromItem !== null) return fromItem;
  return unixSecondsToDate(sub[field]);
}

/** Basil path first, then the legacy invoice.subscription field. */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== 'object') return null;
  const inv = invoice as {
    parent?: { subscription_details?: { subscription?: unknown } | null } | null;
    subscription?: unknown;
  };
  return stripeObjectId(inv.parent?.subscription_details?.subscription)
    ?? stripeObjectId(inv.subscription);
}
