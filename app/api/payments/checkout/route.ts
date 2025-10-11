import { NextResponse } from "next/server";
import { createCheckout, planToTier } from "@/lib/payments";
import { upsertCustomer } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const plan = (b.plan || "pro") as "pro" | "pro_trader";
    const wid = String(b.workspaceId || "");
    
    if (!wid) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    await upsertCustomer(wid);

    const { url } = await createCheckout({
      plan,
      workspaceId: wid,
      successUrl: process.env.CHECKOUT_SUCCESS_URL || `${process.env.NEXT_PUBLIC_APP_URL}/success`,
      cancelUrl: process.env.CHECKOUT_CANCEL_URL || `${process.env.NEXT_PUBLIC_APP_URL}/cancel`
    });

    return NextResponse.json({ url });
  } catch (e: any) {
    console.error("Checkout error:", e);
    return NextResponse.json({ error: e.message || "checkout failed" }, { status: 500 });
  }
}
