import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionFromCookie, hashWorkspaceId } from "@/lib/auth";
import { q } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

// Price IDs from environment variables (set in .env.local and Vercel)
const PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
  pro_trader_monthly: process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY || "",
  pro_trader_yearly: process.env.STRIPE_PRICE_PRO_TRADER_YEARLY || "",
};

export async function POST(req: NextRequest) {
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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      allow_promotion_codes: true, // Allows promo codes
      success_url: `${baseUrl}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        plan,
        billing: billingPeriod,
        referralCode: referralCode || undefined, // Track referral for reward
      },
    });

    // If user has a referral code, record the pending referral
    if (referralCode && email) {
      try {
        // We'll get the actual workspace ID after checkout completes
        // For now, store the referral code in checkout metadata
        console.log(`[Checkout] Referral code ${referralCode} attached to checkout for ${email}`);
      } catch (refError) {
        console.error('[Checkout] Error recording referral:', refError);
        // Don't fail checkout if referral tracking fails
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
