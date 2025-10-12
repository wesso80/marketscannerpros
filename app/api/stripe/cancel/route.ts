import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { customerId, subscriptionId } = await req.json();

    // find subscription id
    let subId = subscriptionId;
    if (!subId && customerId) {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      if (!list.data.length)
        return NextResponse.json({ error: "No active subscription" }, { status: 404 });
      subId = list.data[0].id;
    }

    if (!subId)
      return NextResponse.json({ error: "Missing subscriptionId or customerId" }, { status: 400 });

    // cancel at period end
    const canceled: any = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

    return NextResponse.json({
      ok: true,
      id: canceled.id,
      status: canceled.status,
      cancel_at_period_end: canceled.cancel_at_period_end,
      current_period_end: canceled.current_period_end,
    });
  } catch (err: any) {
    console.error("Stripe cancellation error:", err);
    return NextResponse.json({ 
      error: err.message || "Failed to cancel subscription" 
    }, { status: 400 });
  }
}
