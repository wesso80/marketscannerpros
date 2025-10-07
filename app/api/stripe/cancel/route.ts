import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  try {
    const { customerId, subscriptionId } = await req.json();
    let subId = subscriptionId as string | undefined;

    if (!subId && customerId) {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      if (!list.data.length)
        return NextResponse.json({ error: "No active subscription" }, { status: 404 });
      subId = list.data[0].id;
    }

    if (!subId)
      return NextResponse.json({ error: "Missing subscriptionId or customerId" }, { status: 400 });
    const canceled = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      ok: true,
      id: canceled.id,
      status: canceled.status,
      cancel_at_period_end: canceled.cancel_at_period_end,
      current_period_end: canceled.current_period_end,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
