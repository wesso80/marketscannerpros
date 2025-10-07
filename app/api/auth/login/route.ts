// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signToken } from "@/lib/auth";
// server-side envs
const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO ?? "";
const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "";
const FALLBACK_PRO_TRADER = "price_1SEhYxLyhHN1qVrAWiuGgO0q";
function detectTierFromPrices(ids: string[]): "free" | "pro" | "pro_trader" {
  const arr = ids.filter(Boolean);
  if ((PRICE_PRO_TRADER || FALLBACK_PRO_TRADER) &&
      arr.includes(PRICE_PRO_TRADER || FALLBACK_PRO_TRADER)) return "pro_trader";
  if (PRICE_PRO && arr.includes(PRICE_PRO)) return "pro";
  return "free";
}
const ALLOWED_ORIGINS = new Set([
  "https://app.marketscannerpros.app",
  "https://marketscannerpros.app",
  "https://www.marketscannerpros.app",
]);
function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (o) {
    headers["Access-Control-Allow-Origin"] = o;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
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
      return NextResponse.json({ error: "No subscription found for this email" }, { status: 404 });
    }
    const customer = customers.data[0];
    const customerId = customer.id;
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    const valid = subs.data.filter(s => s.status === "active" || s.status === "trialing");
    if (!valid.length) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }
    const priceIds = valid.flatMap(s => s.items.data.map(it => it.price.id));
    const tier = detectTierFromPrices(priceIds);
    const workspaceId = hashWorkspaceId(customerId);
    await stripe.customers.update(customerId, {
      metadata: { marketscanner_tier: tier, workspace_id: workspaceId },
    });
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
    const token = signToken({ cid: customerId, tier, workspaceId, exp });
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";
    const body: any = { ok: true, tier, workspaceId, message: "Subscription activated successfully!" };
    if (debug) {
      body.debug = {
        priceIds,
        env: {
          NEXT_PUBLIC_PRICE_PRO: process.env.NEXT_PUBLIC_PRICE_PRO ?? "",
          NEXT_PUBLIC_PRICE_PRO_TRADER: process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "",
        },
      };
    }
    const res = NextResponse.json(body);
    res.cookies.set("ms_auth", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".marketscannerpros.app",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Authentication failed. Please try again." }, { status: 500 });
  }
}

export async function OPTIONS(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}
