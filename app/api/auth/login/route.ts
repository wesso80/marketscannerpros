// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Find customer in Stripe
    const customers = await stripe.customers.list({ 
      email: email.toLowerCase().trim(), 
      limit: 1 
    });

    if (!customers.data || customers.data.length === 0) {
      return NextResponse.json({ 
        error: "No subscription found for this email" 
      }, { status: 404 });
    }

    const customer = customers.data[0];
    const customerId = customer.id;

    // Get active or trialing subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    // Filter for active or trialing subscriptions
    const validSubscriptions = subscriptions.data.filter(
      sub => sub.status === "active" || sub.status === "trialing"
    );

    if (!validSubscriptions || validSubscriptions.length === 0) {
      return NextResponse.json({ 
        error: "No active subscription found" 
      }, { status: 404 });
    }

    const subscription = validSubscriptions[0];
    const priceIds = subscription.items.data.map((item) => item.price.id);

    // Determine tier
    let tier: "free" | "pro" | "pro_trader" = "free";
    const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO || "";
    const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER || "price_1SEhYxLyhHN1qVrAWiuGgO0q";

    console.log("Price detection:", { priceIds, PRICE_PRO, PRICE_PRO_TRADER });

    if (PRICE_PRO_TRADER && priceIds.includes(PRICE_PRO_TRADER)) {
      tier = "pro_trader";
    } else if (PRICE_PRO && priceIds.includes(PRICE_PRO)) {
      tier = "pro";
    }
    
    console.log("Detected tier:", tier);

    // Update customer metadata with tier and workspace ID
    await stripe.customers.update(customerId, {
      metadata: {
        marketscanner_tier: tier,
        workspace_id: hashWorkspaceId(customerId),
      },
    });

    const workspaceId = hashWorkspaceId(customerId);

    // Create signed cookie (7 days)
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
    const token = signToken({ cid: customerId, tier, workspaceId, exp });

    const res = NextResponse.json({ 
      ok: true, 
      tier, 
      workspaceId,
      message: "Subscription activated successfully!" 
    });
    
    res.cookies.set("ms_auth", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);
    for (const [k,v] of Object.entries(headers)) res.headers.set(k,v);
    return res;
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ 
      error: "Authentication failed. Please try again." 
    }, { status: 500 });
  }
}

const ALLOWED_ORIGINS = new Set([
  "https://app.marketscannerpros.app",
  "https://marketscannerpros.app"
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

export async function OPTIONS(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}
