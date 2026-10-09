/**
 * Several writers hash a different key into workspace_id (email, Stripe customer
 * id, admin_email). email has no unique constraint, so one person can have two
 * user_subscriptions rows. These helpers pick among those rows. They do not
 * grant Pro to a higher tier on some other row that has no Stripe ids.
 */

const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

export type SubscriptionRowFields = {
  id?: number | string | null;
  tier?: string | null;
  status?: string | null;
  current_period_end?: Date | string | number | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  is_trial?: boolean | null;
  updated_at?: Date | string | number | null;
  created_at?: Date | string | number | null;
  email?: string | null;
};

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timeMillis(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function idRank(row: SubscriptionRowFields): number {
  if (typeof row.id === 'number' && Number.isFinite(row.id)) return row.id;
  const parsed = Number(row.id);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Latest updated_at, then created_at, then id. */
export function subscriptionRecency(row: SubscriptionRowFields): number {
  return timeMillis(row.updated_at) ?? timeMillis(row.created_at) ?? idRank(row);
}

function periodEndMillis(value: SubscriptionRowFields['current_period_end']): number | null {
  return timeMillis(value);
}

export function rowHasStripeIds(row: SubscriptionRowFields): boolean {
  return STRIPE_CUSTOMER_ID.test(trimmed(row.stripe_customer_id)) || trimmed(row.stripe_subscription_id).length > 0;
}

function inPeriodTrial(row: SubscriptionRowFields, nowMs: number): boolean {
  if (row.status !== 'trialing') return false;
  const endMs = periodEndMillis(row.current_period_end);
  return endMs != null && endMs >= nowMs;
}

/** Active, or trialing while current_period_end is still ahead (the end instant counts). */
export function isLiveStripeSubscription(row: SubscriptionRowFields, nowMs: number): boolean {
  if (!rowHasStripeIds(row)) return false;
  if (row.status === 'active') return true;
  return inPeriodTrial(row, nowMs);
}

function accessRank(tier: string | null | undefined): number {
  if (tier === 'pro_trader') return 2;
  if (tier === 'pro') return 1;
  return 0;
}

function byAccessThenRecency(a: SubscriptionRowFields, b: SubscriptionRowFields): number {
  const byAccess = accessRank(b.tier) - accessRank(a.tier);
  if (byAccess !== 0) return byAccess;
  const byTime = subscriptionRecency(b) - subscriptionRecency(a);
  if (byTime !== 0) return byTime;
  return idRank(b) - idRank(a);
}

/**
 * A live row that already has Stripe ids wins. Among those, higher access
 * (pro_trader, then pro) then the latest update. A free row is not replaced
 * by a higher tier on a different row that has no Stripe ids.
 * With no Stripe-backed live row, the workspace row stays (callers pass it
 * first). Otherwise the latest row is used.
 */
export function chooseAccessSubscription<T extends SubscriptionRowFields>(
  workspaceRows: T[],
  otherRows: T[] = [],
  nowMs: number = Date.now(),
): T | null {
  const stripeLive = [...workspaceRows, ...otherRows].filter((row) => isLiveStripeSubscription(row, nowMs));
  if (stripeLive.length > 0) {
    return [...stripeLive].sort(byAccessThenRecency)[0] ?? null;
  }
  if (workspaceRows.length > 0) return workspaceRows[0] ?? null;
  if (otherRows.length === 0) return null;
  return [...otherRows].sort((a, b) => subscriptionRecency(b) - subscriptionRecency(a) || idRank(b) - idRank(a))[0] ?? null;
}

/** Any Stripe id, trial flag, or trialing status on any row blocks another trial. */
export function rowsBlockTrial(rows: SubscriptionRowFields[]): boolean {
  return rows.some((row) => {
    if (trimmed(row.stripe_subscription_id) || trimmed(row.stripe_customer_id)) return true;
    if (row.is_trial === true) return true;
    return row.status === 'trialing';
  });
}

export function chooseStripeCustomerId(rows: SubscriptionRowFields[]): string | null {
  const matches = rows
    .map((row) => ({ row, id: trimmed(row.stripe_customer_id) }))
    .filter((item) => STRIPE_CUSTOMER_ID.test(item.id))
    .sort((a, b) => subscriptionRecency(b.row) - subscriptionRecency(a.row) || idRank(b.row) - idRank(a.row));
  return matches[0]?.id ?? null;
}

export function emailFromSessionCid(cid: string | null | undefined): string | null {
  if (!cid) return null;
  const prefixed = /^(?:free_|trial_|admin_)(.+@.+)$/i.exec(cid);
  if (prefixed?.[1]) return prefixed[1];
  if (cid.includes('@')) return cid;
  return null;
}

/** Unknown live price: keep pro_trader, then pro, else pro. Never free. */
export function tierForUnmappedLiveSubscription(tiers: Array<string | null | undefined>): 'pro' | 'pro_trader' {
  if (tiers.some((tier) => tier === 'pro_trader')) return 'pro_trader';
  if (tiers.some((tier) => tier === 'pro')) return 'pro';
  return 'pro';
}
