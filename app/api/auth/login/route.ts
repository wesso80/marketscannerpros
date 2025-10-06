import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email } = body ?? {};
    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Stripe: verify an active subscription by email
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    if (!stripeKey) {
      return NextResponse.json({ error: "Server misconfigured: missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey);

    // 1) find the customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    const cust = customers.data[0];
    if (!cust) {
      return NextResponse.json({ error: "No Stripe customer found for this email" }, { status: 404 });
    }

    // 2) check if there is any ACTIVE subscription
    const subs = await stripe.subscriptions.list({ customer: typeof cust === "string" ? cust : cust.id, limit: 10 });
    const ok = subs.data.some(s => ["active","trialing"].includes(s.status));
    if (!ok) {
      return NextResponse.json({ error: "No active or trialing subscription found for this email" }, { status: 403 });
    }

    // Success: (you can set a cookie/session here if you like)
return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
