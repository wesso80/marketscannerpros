// app/api/auth/debug/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const customers = await stripe.customers.list({
      email: email.toLowerCase().trim(),
      limit: 1,
    });
    if (!customers.data?.length) {
      return NextResponse.json({ error: "No customer" }, { status: 404 });
    }
    const customer = customers.data[0];

    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
    const valid = subs.data.filter(s => s.status === "active" || s.status === "trialing");
    if (!valid.length) {
      return NextResponse.json({ error: "No active/trialing subs" }, { status: 404 });
    }
    const priceIds = valid.flatMap(s => s.items.data.map(it => it.price.id));
    const priceNicknames = valid.flatMap(s => s.items.data.map(it => it.price.nickname || null));
    const body = {
      customerId: customer.id,
      subscriptionCount: valid.length,
      priceIds,
      priceNicknames,
      envSeenByServer: {
        STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID ?? "",
        STRIPE_PROTRADER_PRICE_ID: process.env.STRIPE_PROTRADER_PRICE_ID ?? "",
        NEXT_PUBLIC_PRICE_PRO: process.env.NEXT_PUBLIC_PRICE_PRO ?? "",
        NEXT_PUBLIC_PRICE_PRO_TRADER: process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "",
      },
    };
    return NextResponse.json(body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "debug failed" }, { status: 500 });
  }
}
