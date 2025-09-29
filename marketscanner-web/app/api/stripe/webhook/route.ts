import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime for raw body

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  const sig = headers().get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    if (!sig || !whsec) throw new Error("Missing signature or STRIPE_WEBHOOK_SECRET");
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // TODO: upsert user subscription in your DB here
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// (Pages Router needs bodyParser:false. App Router uses raw body above.)
export const config = { api: { bodyParser: false } };
