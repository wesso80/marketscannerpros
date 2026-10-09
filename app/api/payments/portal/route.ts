import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { checkoutCustomerFromSession } from "@/lib/checkoutSignIn";
import { isStripeCustomerId } from "@/lib/billingPortal";
import { chooseStripeCustomerId } from "@/lib/subscriptionRow";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

/** Same-origin return. Stripe opens this after the customer leaves the portal. */
const PORTAL_RETURN_URL = "https://marketscannerpros.app/tools/explorer";

async function stripeCustomerIdForEmail(email: string): Promise<string | null> {
  const rows = await q<{ stripe_customer_id: string | null; updated_at?: Date | string | null; created_at?: Date | string | null; id?: number | null }>(
    `SELECT stripe_customer_id, updated_at, created_at, id
      FROM user_subscriptions
      WHERE LOWER(email) = LOWER($1)
      ORDER BY
        CASE WHEN BTRIM(stripe_customer_id) ~ '^cus_[A-Za-z0-9]+$' THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC`,
    [email],
  );
  return chooseStripeCustomerId(rows);
}

export async function POST(_req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || session.cid.startsWith("anon-")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const account = checkoutCustomerFromSession(session.cid);
  let customerId: string | null = null;
  try {
    if (account?.customer_email) {
      customerId = await stripeCustomerIdForEmail(account.customer_email);
    } else if (account?.customer && isStripeCustomerId(account.customer)) {
      customerId = account.customer;
    }
  } catch (error: unknown) {
    console.error("Portal customer lookup failed:", error);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "no_billing_account" }, { status: 404 });
  }

  try {
    // No configuration id: Stripe uses the default Customer portal config for this mode.
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: PORTAL_RETURN_URL,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
