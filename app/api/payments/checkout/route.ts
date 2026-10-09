import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { checkoutCustomerFromSession } from '@/lib/checkoutSignIn';

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

    // If referral code provided, validate it and check for trial
    let validReferral = false;
    let couponId: string | undefined;
    if (referralCode && typeof referralCode === 'string') {
      try {
        validReferral = await validateReferralCode(referralCode);
        if (validReferral) {
          // Check if this price has a free trial — don't apply coupon during trials
          const price = await stripe.prices.retrieve(priceId);
          const hasTrial = (price.recurring?.trial_period_days ?? 0) > 0;
          const disc = REFERRAL_DISCOUNTS[plan] || REFERRAL_DISCOUNTS.pro;

          if (hasTrial) {
            console.log(`[Checkout] Valid referral ${referralCode} — price has trial, coupon deferred until trial converts`);
          } else {
            couponId = await getOrCreateReferralCoupon(plan);
            console.log(`[Checkout] Valid referral ${referralCode} — applying $${disc.cents / 100} coupon for ${plan} (no trial)`);
          }
        }
      } catch (refErr) {
        console.error('[Checkout] Referral validation error (continuing without discount):', refErr);
      }
    }

    // Name and description are the Stripe Product on this price id, not inline product_data.
    // trial_period_days is intentionally not set: there is no checkout helper that
    // enforces one trial per email. Admin user_trials grants are a separate path.
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
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
