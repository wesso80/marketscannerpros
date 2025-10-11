import { NextResponse } from "next/server";
import { stripe, PRICE_IDS, appBaseUrl } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { plan } = await req.json();
    const price = plan === "pro_trader" ? PRICE_IDS.pro_trader : PRICE_IDS.pro;
    if (!price) {
      return NextResponse.json({ error: "Missing price id" }, { status: 400 });
    }

    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing/cancelled`,
      allow_promotion_codes: true
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Checkout error" }, { status: 500 });
  }
}
