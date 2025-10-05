import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}
if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is not set");
}
if (!process.env.NEXT_PUBLIC_PRICE_PRO) {
  throw new Error("NEXT_PUBLIC_PRICE_PRO is not set");
}
// Optional but recommended if you sell Pro Trader:
const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER || "";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Use a stable, official version. Update later if/when you consciously upgrade.
  apiVersion: "2024-06-20",
});

const PLAN_TO_PRICE: Record<string, string> = {
  pro: process.env.NEXT_PUBLIC_PRICE_PRO!,
  pro_trader: PRICE_PRO_TRADER, // set this env if you offer Pro Trader
};

export async function POST(req: NextRequest) {
  try {
    const { plan = "pro" } = await req.json().catch(() => ({ plan: "pro" }));

    const priceId = PLAN_TO_PRICE[plan];
    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?canceled=true`,
      allow_promotion_codes: true,
      // Prefer configuring trials on the Price in Stripe.
      // If you must override here, uncomment and set days:
      // subscription_data: { trial_period_days: plan === "pro" ? 7 : 5 },
      billing_address_collection: "required",
      // Let Stripe choose valid methods; explicit payment_method_types is unnecessary for Checkout.
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("checkout create error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
