import { NextResponse } from "next/server";
import Stripe from "stripe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const looksLive = key.startsWith("sk_live_") && key.length > 20;
  try {
    if (!looksLive) throw new Error("key_missing_or_not_live");
    const stripe = new Stripe(key);
    const acct = await stripe.accounts.retrieve();
    return NextResponse.json({ ok: true, acct: { id: acct.id, country: acct.country } });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message, looksLive }, { status: 500 });
  }
}
