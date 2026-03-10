import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signToken } from "@/lib/auth";
import { q } from "@/lib/db";

const PRO_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_MONTHLY,
  process.env.STRIPE_PRICE_PRO_YEARLY,
].filter(Boolean) as string[];
const PRO_TRADER_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY,
  process.env.STRIPE_PRICE_PRO_TRADER_YEARLY,
].filter(Boolean) as string[];

function detectTier(priceIds: string[]): "free" | "pro" | "pro_trader" {
  if (priceIds.some(id => PRO_TRADER_PRICE_IDS.includes(id))) return "pro_trader";
  if (priceIds.some(id => PRO_PRICE_IDS.includes(id))) return "pro";
  return "free";
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const validPayment = 
      checkoutSession.status === "complete" ||
      checkoutSession.payment_status === "paid" ||
      checkoutSession.payment_status === "no_payment_required"; // $0 coupon/promo
    if (!validPayment) {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    const customerId = checkoutSession.customer as string;
    if (!customerId) {
      return NextResponse.json({ error: "No customer found" }, { status: 400 });
    }

    const sub = checkoutSession.subscription as import("stripe").Stripe.Subscription | null;
    const priceIds = sub?.items?.data?.map(it => it.price.id) ?? [];
    const tier = detectTier(priceIds);
    const workspaceId = hashWorkspaceId(customerId);
    const email = checkoutSession.customer_details?.email || checkoutSession.customer_email || "";

    // Update subscription in database
    if (email) {
      try {
        await q(`
          INSERT INTO user_subscriptions 
            (workspace_id, email, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at, created_at)
          VALUES ($1, $2, $3, 'active', $4, $5, $6, NOW(), NOW())
          ON CONFLICT (workspace_id) 
          DO UPDATE SET 
            email = EXCLUDED.email,
            tier = EXCLUDED.tier,
            status = 'active',
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            current_period_end = EXCLUDED.current_period_end,
            updated_at = NOW()
        `, [
          workspaceId,
          email,
          tier,
          customerId,
          sub?.id || null,
          sub ? new Date((sub as any).current_period_end * 1000) : null,
        ]);
      } catch (dbErr) {
        console.error("[stripe/confirm] DB error:", dbErr);
      }
    }

    // Issue new session cookie with the paid tier
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    const token = signToken({ cid: customerId, tier, workspaceId, exp });

    const host = req.headers.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

    const res = NextResponse.json({ ok: true, tier, workspaceId });
    res.cookies.set("ms_auth", token, isLocalhost
      ? { httpOnly: true, secure: false, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 }
      : { httpOnly: true, secure: true, sameSite: "none" as const, domain: ".marketscannerpros.app", path: "/", maxAge: 60 * 60 * 24 * 30 }
    );

    return res;
  } catch (err) {
    console.error("[stripe/confirm] Error:", err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
