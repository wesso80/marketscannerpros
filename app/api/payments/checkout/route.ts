import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

// Price IDs from Stripe Dashboard
const PRICE_IDS = {
  pro_monthly: "price_1SfcQJLyhHN1qVrAfOpufz0L",
  pro_yearly: "price_1SfcRsLyhHN1qVrAuRE6IRU1",
  pro_trader_monthly: "price_1SfcSZLyhHN1qVrAaVrilpyO",
  pro_trader_yearly: "price_1SfcTALyhHN1qVrAoIHo4LN1",
};

export async function POST(req: NextRequest) {
  try {
    const { plan, billing, email } = await req.json();

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

    // Base URL for redirects
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://marketscannerpros.app";

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
      allow_promotion_codes: true, // Allows NEWYEAR25 code
      success_url: `${baseUrl}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        plan,
        billing: billingPeriod,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
