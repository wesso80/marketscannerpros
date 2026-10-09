import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { checkoutCustomerFromSession } from '@/lib/checkoutSignIn';
import { isLiveStripeSubscription, rowsBlockTrial, type SubscriptionRowFields } from '@/lib/subscriptionRow';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

// 2026 pricing simplification: only the single Pro plan is sold here.
// The operator has repriced the legacy Pro Trader Stripe price IDs to the new
// $24.99/mo and $249/yr Pro plan, so `STRIPE_PRICE_PRO_TRADER_*` is now the
// live source of truth for new subscriptions. `STRIPE_PRO_*_PRICE_ID` (new
// env-var names) is preferred if set, and the old Pro price IDs remain as a
// last-resort fallback for continuity — they are unused in Stripe today.
const PRICE_IDS = {
  pro_monthly:
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID ||
    process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY ||
    process.env.STRIPE_PRICE_PRO_MONTHLY ||
    '',
  pro_yearly:
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID ||
    process.env.STRIPE_PRICE_PRO_TRADER_YEARLY ||
    process.env.STRIPE_PRICE_PRO_YEARLY ||
    '',
};

// Referral discount for the single Pro plan (only path new subscribers take).
const REFERRAL_DISCOUNTS: Record<string, { cents: number; couponId: string; label: string }> = {
  pro: { cents: 500, couponId: 'referral_5_off', label: 'Referral $5 Off' },
};

/** Get or create a plan-specific referral coupon */
async function getOrCreateReferralCoupon(plan: string): Promise<string> {
  const disc = REFERRAL_DISCOUNTS[plan] || REFERRAL_DISCOUNTS.pro;
  try {
    const existing = await stripe.coupons.retrieve(disc.couponId);
    return existing.id;
  } catch {
    const coupon = await stripe.coupons.create({
      id: disc.couponId,
      amount_off: disc.cents,
      currency: 'usd',
      duration: 'once',
      name: disc.label,
    });
    return coupon.id;
  }
}

/** Validate that a referral code exists in the database */
async function validateReferralCode(code: string): Promise<boolean> {
  const rows = await q(
    `SELECT 1 FROM referrals WHERE referral_code = $1 LIMIT 1`,
    [code.toUpperCase()]
  );
  return rows.length > 0;
}

function dbErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/**
 * One trial per email, using rows that already exist.
 * user_trials keeps admin grants, including expired and revoked ones.
 * user_subscriptions keeps the Stripe customer and subscription ids after cancel.
 * A free account row (no Stripe ids, not a trial) does not count.
 */
async function emailHadTrialOrSubscription(email: string): Promise<boolean> {
  try {
    const trials = await q(
      `SELECT 1 FROM user_trials WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    if (trials.length > 0) return true;
  } catch (error) {
    if (!dbErrorMessage(error).includes('does not exist')) throw error;
  }
  const subs = await q<{
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    is_trial: boolean | null;
    status: string | null;
  }>(
    `SELECT stripe_subscription_id, stripe_customer_id, is_trial, status
      FROM user_subscriptions
      WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return rowsBlockTrial(subs);
}

const STRIPE_CONFIRMED_LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid']);

type CheckoutSubRow = SubscriptionRowFields;

function subscriptionIdOf(row: CheckoutSubRow): string {
  return typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id.trim() : '';
}

function grantsPro(row: CheckoutSubRow): boolean {
  return row.tier === 'pro' || row.tier === 'pro_trader';
}

function periodEndMillis(value: CheckoutSubRow['current_period_end']): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Active row whose period end is missing or already past. A NULL end is not
 * proof the period is still open, so Stripe is asked before a 409.
 */
function isStaleActive(row: CheckoutSubRow, nowMs: number): boolean {
  if (row.status !== 'active' || !subscriptionIdOf(row)) return false;
  const endMs = periodEndMillis(row.current_period_end);
  return endMs == null || endMs < nowMs;
}

/** Trialing row that no longer counts as live because the period end is missing or past. */
function isStaleTrial(row: CheckoutSubRow, nowMs: number): boolean {
  if (row.status !== 'trialing' || !subscriptionIdOf(row)) return false;
  return !isLiveStripeSubscription(row, nowMs);
}

/**
 * Certain block: the row grants Pro and is live, and the period end is known
 * to still be ahead. A missing or past end is not certain.
 */
function certainProLive(row: CheckoutSubRow, nowMs: number): boolean {
  if (!subscriptionIdOf(row) || !grantsPro(row) || isStaleActive(row, nowMs)) return false;
  return isLiveStripeSubscription(row, nowMs);
}

/** past_due and unpaid still claim a Stripe subscription. Confirm with Stripe before refusing. */
function owedSubscription(row: CheckoutSubRow): boolean {
  if (!subscriptionIdOf(row)) return false;
  return row.status === 'past_due' || row.status === 'unpaid';
}

/**
 * Stored as free, but active or trialing with a subscription id. The tier may
 * be wrong. Ask Stripe before opening a second Checkout.
 */
function mislabelledFree(row: CheckoutSubRow): boolean {
  if (row.tier !== 'free' || !subscriptionIdOf(row)) return false;
  return row.status === 'active' || row.status === 'trialing';
}

/** Ask Stripe. A failed retrieve blocks checkout for every one of these rows. */
function needsStripeConfirm(row: CheckoutSubRow, nowMs: number): boolean {
  return isStaleTrial(row, nowMs) || isStaleActive(row, nowMs) || mislabelledFree(row) || owedSubscription(row);
}

function knownProPriceIds(): Set<string> {
  return new Set(
    [
      PRICE_IDS.pro_monthly,
      PRICE_IDS.pro_yearly,
      process.env.STRIPE_PRICE_PRO_MONTHLY,
      process.env.STRIPE_PRICE_PRO_YEARLY,
      process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY,
      process.env.STRIPE_PRICE_PRO_TRADER_YEARLY,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

function subscriptionHasProPrice(subscription: {
  items?: { data?: Array<{ price?: { id?: string | null } | null } | null> | null } | null;
}): boolean {
  const prices = knownProPriceIds();
  return (subscription.items?.data ?? []).some((item) => {
    const id = item?.price?.id;
    return typeof id === 'string' && prices.has(id);
  });
}

function stripeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return 'unknown';
}

type StripeConfirm = 'live_pro' | 'not_live' | 'failed';

/**
 * live_pro: Stripe status is active, trialing, past_due, or unpaid, on a Pro price.
 * not_live: Stripe answered and it is not that. Checkout may proceed.
 * failed: the retrieve call threw. Checkout stays closed.
 */
async function confirmStripeSubscription(subscriptionId: string): Promise<StripeConfirm> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!STRIPE_CONFIRMED_LIVE.has(subscription.status) || !subscriptionHasProPrice(subscription)) return 'not_live';
    return 'live_pro';
  } catch (error) {
    console.error(`[Checkout] subscription confirm failed (${stripeErrorCode(error)})`);
    return 'failed';
  }
}

const ALREADY_SUBSCRIBED = {
  error: 'You already have Pro. Manage it in billing.',
  code: 'already_subscribed' as const,
  portalUrl: '/api/payments/portal',
};

const BILLING_CHECK_FAILED = {
  error: "We couldn't confirm your billing status right now. Please try again in a minute or open billing.",
  code: 'billing_check_failed' as const,
  portalUrl: '/api/payments/portal',
};

type CheckoutBlock = typeof ALREADY_SUBSCRIBED | typeof BILLING_CHECK_FAILED | null;

async function checkoutBlock(email: string | null, customerId: string | null): Promise<CheckoutBlock> {
  if (!email && !customerId) return null;
  const rows = await q<CheckoutSubRow>(
    `SELECT tier, status, current_period_end, stripe_subscription_id, stripe_customer_id
       FROM user_subscriptions
      WHERE ($1::text IS NOT NULL AND LOWER(email) = LOWER($1::text))
         OR ($2::text IS NOT NULL AND stripe_customer_id = $2)`,
    [email, customerId],
  );
  const now = Date.now();
  if (rows.some((row) => certainProLive(row, now))) return ALREADY_SUBSCRIBED;

  const confirmIds = [...new Set(rows.filter((row) => needsStripeConfirm(row, now)).map(subscriptionIdOf).filter(Boolean))];
  let retrieveFailed = false;
  for (const id of confirmIds) {
    const confirmed = await confirmStripeSubscription(id);
    if (confirmed === 'live_pro') return ALREADY_SUBSCRIBED;
    if (confirmed === 'failed') retrieveFailed = true;
  }
  // A failed retrieve on any subscription id stays closed. Canceled and non-Pro answers do not.
  return retrieveFailed ? BILLING_CHECK_FAILED : null;
}

async function resolveCheckoutEmail(fields: { customer?: string; customer_email?: string }): Promise<string | null> {
  if (fields.customer_email) return fields.customer_email;
  if (!fields.customer) return null;
  try {
    const rows = await q<{ email: string | null }>(
      `SELECT email FROM user_subscriptions WHERE stripe_customer_id = $1 AND email IS NOT NULL LIMIT 1`,
      [fields.customer],
    );
    if (rows[0]?.email) return rows[0].email;
    const customer = await stripe.customers.retrieve(fields.customer);
    if (customer.deleted) return null;
    const email = customer.email?.trim();
    return email || null;
  } catch (error) {
    console.error('[Checkout] Could not resolve checkout email; continuing without a trial');
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: prevent checkout session spam
  const ip = getClientIP(req);
  const rateCheck = apiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Anonymous FREE_FOR_ALL sessions are not a sign-in. Checkout needs a real account.
  const session = await getSessionFromCookie();
  if (!session || session.cid.startsWith('anon-')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const customerFields = checkoutCustomerFromSession(session.cid);
  if (!customerFields) {
    return NextResponse.json({ error: 'This account has no email for checkout' }, { status: 400 });
  }

  try {
    const { plan, billing, referralCode } = await req.json();

    // Only the Pro plan is sold. Anything else is rejected (legacy sub renewals
    // do not go through this endpoint).
    if (plan !== 'pro') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Validate billing period
    const billingPeriod = billing || 'monthly';
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 });
    }

    // Get the correct price ID
    const priceKey = `${plan}_${billingPeriod}` as keyof typeof PRICE_IDS;
    const priceId = PRICE_IDS[priceKey];

    if (!priceId) {
      return NextResponse.json({ error: "Price not found" }, { status: 400 });
    }

    // Base URL for redirects - always use Next.js site (not Streamlit)
    const baseUrl = "https://marketscannerpros.app";

    // 7 days only when this email has no stored trial and no stored Stripe subscription.
    // A failed read does not guess: checkout continues with no trial.
    let grantTrial = false;
    const trialEmail = await resolveCheckoutEmail(customerFields);
    // A failed subscription read must not turn into a 500. Continue as if no live row was found.
    let block: CheckoutBlock = null;
    try {
      block = await checkoutBlock(trialEmail, customerFields.customer ?? null);
    } catch {
      console.error('[Checkout] Subscription read failed; continuing checkout');
      block = null;
    }
    if (block) {
      return NextResponse.json(block, { status: 409 });
    }
    if (trialEmail) {
      try {
        grantTrial = !(await emailHadTrialOrSubscription(trialEmail));
      } catch (error) {
        console.error('[Checkout] Trial eligibility read failed; continuing without a trial');
        grantTrial = false;
      }
    }

    // If referral code provided, validate it and check for trial
    let validReferral = false;
    let couponId: string | undefined;
    if (referralCode && typeof referralCode === 'string') {
      try {
        validReferral = await validateReferralCode(referralCode);
        if (validReferral) {
          // Check if this price has a free trial — don't apply coupon during trials
          const price = await stripe.prices.retrieve(priceId);
          const hasTrial = grantTrial || (price.recurring?.trial_period_days ?? 0) > 0;
          const disc = REFERRAL_DISCOUNTS[plan] || REFERRAL_DISCOUNTS.pro;

          if (hasTrial) {
            console.log(`[Checkout] Valid referral ${referralCode} — trial in effect, coupon deferred until trial converts`);
          } else {
            couponId = await getOrCreateReferralCoupon(plan);
            console.log(`[Checkout] Valid referral ${referralCode} — applying $${disc.cents / 100} coupon for ${plan} (no trial)`);
          }
        }
      } catch (refErr) {
        console.error(`[Checkout] Referral validation error (${stripeErrorCode(refErr)}); continuing without discount`);
      }
    }

    // Name and description stay on the Stripe Product for this price id.
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...customerFields,
      success_url: `${baseUrl}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        plan,
        billing: billingPeriod,
        referralCode: validReferral ? referralCode : undefined,
      },
      ...(grantTrial ? { subscription_data: { trial_period_days: 7 } } : {}),
    };

    // Stripe doesn't allow allow_promotion_codes + discounts together
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(`[Checkout] Checkout error (${stripeErrorCode(error)})`);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
