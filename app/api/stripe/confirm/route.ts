// app/api/stripe/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "missing session_id" }, { status: 400 });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });

    // Customer can be string or object
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (!customerId) {
      return NextResponse.json({ error: "no customer on session" }, { status: 400 });
    }

    // Determine tier from subscription
    let tier: "free" | "pro" | "pro_trader" = "free";
    const sub: any = session.subscription;

    const status: string | undefined = sub?.status;
    const items = sub?.items?.data ?? [];
    const priceIds = items.map((it: any) => it.price?.id).filter(Boolean);

    if (["active", "trialing", "past_due"].includes(status || "") && priceIds.length) {
      // Map price ids to human tiers
      const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO!;
      const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER!;
      
      if (priceIds.includes(PRICE_PRO_TRADER)) tier = "pro_trader";
      else if (priceIds.includes(PRICE_PRO)) tier = "pro";
    }

    // Mirror tier into Stripe customer metadata (source of truth)
    await stripe.customers.update(customerId, {
      metadata: { 
        marketscanner_tier: tier,
        workspace_id: hashWorkspaceId(customerId)  // Store stable workspace ID
      },
    });

    const workspaceId = hashWorkspaceId(customerId);

    // Short-lived signed cookie (7 days). Refreshed on each visit.
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
    const token = signToken({ cid: customerId, tier, workspaceId, exp });

    const res = NextResponse.json({ ok: true, tier, workspaceId, cid: customerId });
    res.cookies.set("ms_auth", token, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      domain: ".marketscannerpros.app",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err: any) {
    console.error("confirm error", err);
    return NextResponse.json({ error: err.message ?? "stripe error" }, { status: 500 });
  }
}
