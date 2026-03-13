import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { q } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

// Price IDs from environment variables (set in .env.local and Render)
const PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
  pro_trader_monthly: process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY || "",
  pro_trader_yearly: process.env.STRIPE_PRICE_PRO_TRADER_YEARLY || "",
};

const REFERRAL_CREDIT_CENTS = parseInt(process.env.REFERRAL_CREDIT_CENTS || '2000', 10);
const REFERRAL_COUPON_ID = 'referral_20_off';

/** Get or create a reusable $20-off coupon for referral discounts */
async function getOrCreateReferralCoupon(): Promise<string> {
  try {
    const existing = await stripe.coupons.retrieve(REFERRAL_COUPON_ID);
    return existing.id;
  } catch {
    const coupon = await stripe.coupons.create({
      id: REFERRAL_COUPON_ID,
      amount_off: REFERRAL_CREDIT_CENTS,
      currency: 'usd',
      duration: 'once',
      name: 'Referral $20 Off',
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

  try {
    const { plan, billing, email, referralCode } = await req.json();

    // Validate plan
    if (!plan || !["pro", "pro_trader"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Validate billing period
    const billingPeriod = billing || "monthly";
    if (!["monthly", "yearly"].includes(billingPeriod)) {
      return NextResponse.json({ error: "Invalid billing period" }, { status: 400 });
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

          if (hasTrial) {
            console.log(`[Checkout] Valid referral ${referralCode} — price has trial, coupon deferred until trial converts`);
          } else {
            couponId = await getOrCreateReferralCoupon();
            console.log(`[Checkout] Valid referral ${referralCode} — applying $${REFERRAL_CREDIT_CENTS / 100} coupon (no trial)`);
          }
        }
      } catch (refErr) {
        console.error('[Checkout] Referral validation error (continuing without discount):', refErr);
      }
    }

    // Build checkout session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
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
