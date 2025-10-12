import { NextResponse } from "next/server";
import { stripe, PRICE_IDS, appBaseUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { plan = "pro", workspaceId } = await req.json();
    const price = PRICE_IDS.pro;
    if (!price?.startsWith("price_")) return NextResponse.json({ error: "Missing price id" }, { status: 400 });
    if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

    const base = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/after-checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pricing?canceled=true`,
      allow_promotion_codes: true,
      metadata: { workspace_id: workspaceId, plan_code: "pro" },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Checkout error:", e);
    return NextResponse.json({ error: e.message || "checkout_error" }, { status: 500 });
  }
}
