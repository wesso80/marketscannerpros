import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  try {
    const { customerId, returnUrl } = await req.json();
    if (!customerId) return NextResponse.json({ error: "Missing customerId" }, { status: 400 });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || process.env.NEXT_PUBLIC_APP_URL!,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("portal error:", err);
    return NextResponse.json({ error: "Stripe error", detail: err.message }, { status: 500 });
  }
}
