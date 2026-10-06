import type Stripe from 'stripe';

// API 2025-03-31.basil removed current_period_start / current_period_end from
// Subscription. The pinned version (2025-09-30.clover) puts them on each
// subscription item. Older payloads may still send the top-level fields.

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

export function subscriptionPeriodDate(
  subscription: Stripe.Subscription,
  field: 'current_period_end' | 'current_period_start',
): Date | null {
  const item = subscription.items?.data?.[0];
  const fromItem = unixSecondsToDate(item?.[field]);
  if (fromItem !== null) return fromItem;
  const legacy = (subscription as Stripe.Subscription & Record<string, unknown>)[field];
  return unixSecondsToDate(legacy);
}
