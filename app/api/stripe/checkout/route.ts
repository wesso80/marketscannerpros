// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://marketscannerpros.app";
const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO!;
const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER!;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tier } = body; // "pro" or "pro_trader"
    
    const priceId = tier === "pro_trader" ? PRICE_PRO_TRADER : PRICE_PRO;
    
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("checkout create error", err);
    return NextResponse.json({ error: err.message ?? "stripe error" }, { status: 500 });
  }
}
