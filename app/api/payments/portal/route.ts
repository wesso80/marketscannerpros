import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionFromCookie, loggedErrorCode } from "@/lib/auth";
import { q } from "@/lib/db";
import { checkoutCustomerFromSession } from "@/lib/checkoutSignIn";
import { isStripeCustomerId } from "@/lib/billingPortal";
import { chooseAccessSubscription, chooseStripeCustomerId, isLiveStripeSubscription, subscriptionRecency, type SubscriptionRowFields } from "@/lib/subscriptionRow";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

/** Same-origin return. Stripe opens this after the customer leaves the portal. */
const PORTAL_RETURN_URL = "https://marketscannerpros.app/tools/explorer";

type PortalSubscriptionRow = SubscriptionRowFields & { workspace_id?: string | null };

function errorCode(error: unknown): string {
  const code = loggedErrorCode(error);
  return code == null ? 'unknown' : String(code);
}

function customerIdOnRow(row: SubscriptionRowFields | null): string | null {
  const id = typeof row?.stripe_customer_id === 'string' ? row.stripe_customer_id.trim() : '';
  return isStripeCustomerId(id) ? id : null;
}

async function stripeCustomerIdForEmail(email: string, workspaceId: string): Promise<string | null> {
  const rows = await q<PortalSubscriptionRow>(
    `SELECT workspace_id, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id,
            updated_at, created_at, id
       FROM user_subscriptions
      WHERE LOWER(email) = LOWER($1)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC`,
    [email],
  );
  const workspaceRows = rows.filter((row) => row.workspace_id === workspaceId);
  const otherRows = rows.filter((row) => row.workspace_id !== workspaceId);
  const now = Date.now();
  const chosen = chooseAccessSubscription(workspaceRows, otherRows, now);
  if (chosen && isLiveStripeSubscription(chosen, now)) {
    const chosenId = customerIdOnRow(chosen);
    if (chosenId) return chosenId;
  }
  const payable = rows
    .filter((row) => {
      const subscriptionId = typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id.trim() : '';
      return (row.status === 'past_due' || row.status === 'unpaid') && subscriptionId.length > 0 && customerIdOnRow(row);
    })
    .sort((a, b) => subscriptionRecency(b) - subscriptionRecency(a));
  return customerIdOnRow(payable[0] ?? null) ?? chooseStripeCustomerId(rows);
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
      customerId = await stripeCustomerIdForEmail(account.customer_email, session.workspaceId);
    } else if (account?.customer && isStripeCustomerId(account.customer)) {
      customerId = account.customer;
    }
  } catch (error: unknown) {
    console.error(`Portal customer lookup failed (${errorCode(error)})`);
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
    console.error(`Portal error (${errorCode(error)})`);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
