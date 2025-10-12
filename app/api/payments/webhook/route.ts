import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("❌ Invalid Stripe signature:", err?.message);
    return new NextResponse("Bad signature", { status: 400 });
  }
  const client = createClient({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const ins = await client.query(
      "INSERT INTO stripe_events (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [event.id]
    );
    if (ins.rowCount === 0) {
      await client.end();
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as any;
      const status: string = sub.status;
      const active = ["active", "trialing", "past_due"].includes(status);
      const newStatus = active ? "active" : status === "canceled" ? "cancelled" : status;
      const customerId: string = sub.customer as string;
      let workspaceId: string | undefined = sub.metadata?.workspace_id;
      if (!workspaceId) {
        const customer: any = await stripe.customers.retrieve(customerId);
        workspaceId = customer?.metadata?.workspace_id;
      }

      if (workspaceId) {
        if (newStatus === "active") {
          await client.query(
            `INSERT INTO user_subscriptions
               (workspace_id, plan_code, subscription_status, stripe_subscription_id)
             VALUES ($1,'pro','active',$2)
             ON CONFLICT (workspace_id) DO UPDATE
               SET subscription_status='active',
                   plan_code='pro',
                   stripe_subscription_id=EXCLUDED.stripe_subscription_id,
                   cancelled_at=NULL`,
            [workspaceId, sub.id]
          );
        } else if (newStatus === "cancelled" || event.type === "customer.subscription.deleted") {
          await client.query(
            `UPDATE user_subscriptions
               SET subscription_status='cancelled', cancelled_at=now()
             WHERE workspace_id=$1 OR stripe_subscription_id=$2`,
            [workspaceId, sub.id]
          );
        }
      }
    }

    await client.end();
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    try { await client.end(); } catch {}
    return new NextResponse("handler_error", { status: 500 });
  }
}
