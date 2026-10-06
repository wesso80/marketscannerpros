import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signSessionToken } from "@/lib/auth";
import { q } from "@/lib/db";
import { subscriptionPeriodDate } from "@/lib/stripeSubscriptionPeriod";

const PRO_PRICE_IDS = [
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
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

const PROTECTED_STATUSES = ["active", "trialing", "past_due", "unpaid"];

/** Same rule as the webhook: a live active or trialing sub always wins. */
function mayReplaceSubscription(
  existing: { stripe_subscription_id?: string | null; status?: string | null },
  incomingSubscriptionId: string,
  incomingStatus: string,
): boolean {
  const currentId = typeof existing.stripe_subscription_id === "string" ? existing.stripe_subscription_id : "";
  if (!currentId) {
    const status = existing.status || "";
    if (status === "active" && (incomingStatus === "canceled" || incomingStatus === "incomplete" || incomingStatus === "incomplete_expired")) {
      return false;
    }
    return true;
  }
  if (currentId === incomingSubscriptionId) return true;
  if (incomingStatus === "active" || incomingStatus === "trialing") return true;
  return !PROTECTED_STATUSES.includes(existing.status || "");
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
    const email = (checkoutSession.customer_details?.email || checkoutSession.customer_email || "").toLowerCase().trim();
    const workspaceId = email ? hashWorkspaceId(email) : hashWorkspaceId(customerId);
    const periodEnd = sub ? subscriptionPeriodDate(sub, "current_period_end") : null;
    const subscriptionStatus = sub?.status || "active";
    const livePaid = sub?.status === "active" || sub?.status === "trialing";
    let keptTier = "";
    if (sub && !periodEnd) {
      console.error(`[stripe/confirm] subscription ${sub.id}: current_period_end missing or unusable on items.data[0] and on the subscription; storing null`);
    }

    // Update subscription in database
    if (email) {
      try {
        const existing = await q<{ stripe_subscription_id: string | null; status: string; tier?: string }>(
          `SELECT stripe_subscription_id, status, tier FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
          [workspaceId],
        );
        const incomingId = sub?.id || "";
        const guardStatus = sub?.status || "canceled";
        const existingTier = typeof existing[0]?.tier === "string" ? existing[0].tier : "";
        if (tier === "free" && livePaid && existingTier && existingTier !== "free") {
          keptTier = existingTier;
          console.error(`[stripe/confirm] subscription ${incomingId || "none"}: unknown price id(s) [${priceIds.join(", ") || "none"}] with status ${subscriptionStatus}; keeping the existing tier`);
        }
        if (existing[0] && !mayReplaceSubscription(existing[0], incomingId, guardStatus)) {
          console.error(`[stripe/confirm] Not overwriting ${existing[0].status} subscription ${existing[0].stripe_subscription_id} with ${subscriptionStatus} ${incomingId || "none"}`);
        } else {
          const written = await q(`
            INSERT INTO user_subscriptions 
              (workspace_id, email, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            ON CONFLICT (workspace_id) 
            DO UPDATE SET 
              email = EXCLUDED.email,
              tier = CASE
                WHEN EXCLUDED.tier = 'free' AND EXCLUDED.status IN ('active', 'trialing', 'past_due')
                THEN user_subscriptions.tier
                ELSE EXCLUDED.tier
              END,
              status = EXCLUDED.status,
              stripe_customer_id = EXCLUDED.stripe_customer_id,
              stripe_subscription_id = EXCLUDED.stripe_subscription_id,
              current_period_end = EXCLUDED.current_period_end,
              updated_at = NOW()
            WHERE (
                  user_subscriptions.stripe_subscription_id IS NULL
                  AND NOT (
                    user_subscriptions.status = 'active'
                    AND EXCLUDED.status IN ('canceled', 'incomplete', 'incomplete_expired')
                  )
                )
               OR user_subscriptions.stripe_subscription_id = EXCLUDED.stripe_subscription_id
               OR $8::boolean
               OR user_subscriptions.status NOT IN ('active', 'trialing', 'past_due', 'unpaid')
            RETURNING workspace_id
          `, [
            workspaceId,
            email,
            tier,
            subscriptionStatus,
            customerId,
            sub?.id || null,
            periodEnd,
            livePaid,
          ]);
          if (written.length === 0) {
            console.error(`[stripe/confirm] Upsert skipped by conflict guard for ${email} (${incomingId || "none"})`);
          }
        }
      } catch (dbErr) {
        console.error("[stripe/confirm] DB error:", dbErr);
        return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
      }
    }

    // A canceled or unpaid replay must not mint a Pro session.
    // An unknown price on a live sub keeps the tier already stored.
    const sessionTier = !livePaid ? "free" : (keptTier || tier);
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    const token = signSessionToken({ cid: customerId, tier: sessionTier, workspaceId, exp });

    const host = req.headers.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

    const res = NextResponse.json({ ok: true, tier: sessionTier, workspaceId });
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
