// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { hashWorkspaceId, signToken } from "@/lib/auth";
import { q } from "@/lib/db";

// server-side envs
const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO ?? "";
const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "";

// New Live Price IDs
const PRO_PRICE_IDS = [
  "price_1SfcQJLyhHN1qVrAfOpufz0L", // Pro Monthly
  "price_1SfcRsLyhHN1qVrAuRE6IRU1", // Pro Yearly
];
const PRO_TRADER_PRICE_IDS = [
  "price_1SfcSZLyhHN1qVrAaVrilpyO", // Pro Trader Monthly
  "price_1SfcTALyhHN1qVrAoIHo4LN1", // Pro Trader Yearly
];

function detectTierFromPrices(ids: string[]): "free" | "pro" | "pro_trader" {
  const arr = ids.filter(Boolean);
  // Check Pro Trader first (higher tier)
  if (arr.some(id => PRO_TRADER_PRICE_IDS.includes(id))) return "pro_trader";
  if (arr.some(id => PRO_PRICE_IDS.includes(id))) return "pro";
  // Legacy fallback
  if (PRICE_PRO_TRADER && arr.includes(PRICE_PRO_TRADER)) return "pro_trader";
  if (PRICE_PRO && arr.includes(PRICE_PRO)) return "pro";
  return "free";
}

// Check if user has an active trial
async function checkTrialAccess(email: string): Promise<{ tier: "pro" | "pro_trader"; expiresAt: Date } | null> {
  try {
    const trials = await q<{ tier: string; expires_at: string }>(
      `SELECT tier, expires_at FROM user_trials 
       WHERE email = $1 AND expires_at > NOW() 
       ORDER BY expires_at DESC LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    
    if (trials.length > 0) {
      return {
        tier: trials[0].tier as "pro" | "pro_trader",
        expiresAt: new Date(trials[0].expires_at)
      };
    }
  } catch (error: any) {
    // Table might not exist yet - that's OK, just skip trials
    if (!error?.message?.includes('does not exist')) {
      console.error("Trial check error:", error);
    }
  }
  return null;
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

    const normalizedEmail = email.toLowerCase().trim();

    // ========================================
    // STEP 1: Check for active trial FIRST
    // ========================================
    const trial = await checkTrialAccess(normalizedEmail);
    if (trial) {
      // User has an active trial - grant access without Stripe
      const workspaceId = hashWorkspaceId(`trial_${normalizedEmail}`);
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
      const token = signToken({ cid: `trial_${normalizedEmail}`, tier: trial.tier, workspaceId, exp });
      
      const daysLeft = Math.ceil((trial.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      const body = { 
        ok: true, 
        tier: trial.tier, 
        workspaceId, 
        message: `Trial activated! ${daysLeft} days remaining.`,
        isTrial: true,
        trialExpiresAt: trial.expiresAt.toISOString()
      };
      
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
    }

    // ========================================
    // STEP 2: No trial found - check Stripe
    // ========================================
    const customers = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    });
    if (!customers.data?.length) {
      return NextResponse.json({ error: "No subscription or trial found for this email" }, { status: 404 });
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
