// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { subscriptionPeriodDate } from "@/lib/stripe/subscriptionPeriod";
import { hashWorkspaceId, signSessionToken, verifySessionToken } from "@/lib/auth";
import { q } from "@/lib/db";
import { loginLimiter, getClientIP } from "@/lib/rateLimit";
import { isValidAdminSecret } from "@/lib/adminAuth";
import { sendNewSignupNotification } from "@/lib/email";

// Admin emails from ADMIN_EMAILS env var (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// server-side envs
const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO ?? "";
const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "";

// Price IDs from env vars — new + legacy accepted for continuity.
const PRO_PRICE_IDS = [
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  process.env.STRIPE_PRICE_PRO_MONTHLY,
  process.env.STRIPE_PRICE_PRO_YEARLY,
].filter(Boolean) as string[];
const PRO_TRADER_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY,
  process.env.STRIPE_PRICE_PRO_TRADER_YEARLY,
].filter(Boolean) as string[];

function detectTierFromPrices(ids: string[]): "free" | "pro" | "pro_trader" {
  const arr = ids.filter(Boolean);
  // Legacy Pro Trader IDs keep the "pro_trader" DB label so existing subs
  // are not force-migrated; both `pro` and `pro_trader` grant full paid access.
  if (arr.some(id => PRO_TRADER_PRICE_IDS.includes(id))) return "pro_trader";
  if (arr.some(id => PRO_PRICE_IDS.includes(id))) return "pro";
  // Legacy NEXT_PUBLIC_* fallback
  if (PRICE_PRO_TRADER && arr.includes(PRICE_PRO_TRADER)) return "pro_trader";
  if (PRICE_PRO && arr.includes(PRICE_PRO)) return "pro";
  return "free";
}

const PROTECTED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

/**
 * A protected row stays put unless the incoming write is a live subscription:
 * trialing (login trial or Stripe trial), or active with a Stripe subscription id.
 * A free/active write with no subscription id may only refresh another active
 * row that also has no subscription id. A stale or different subscription does
 * not replace active, trialing, past_due, or unpaid.
 */
export function incomingMayReplaceSubscriptionRow(
  existing: { status: string; stripe_subscription_id: string | null } | null | undefined,
  incomingStatus: string,
  incomingSubscriptionId: string | null,
): boolean {
  if (!existing || !PROTECTED_SUBSCRIPTION_STATUSES.has(existing.status)) return true;
  if ((incomingStatus === 'active' || incomingStatus === 'trialing') && incomingSubscriptionId != null) return true;
  if (incomingStatus === 'trialing') return true;
  return incomingStatus === 'active'
    && incomingSubscriptionId == null
    && existing.status === 'active'
    && existing.stripe_subscription_id == null;
}

// Track user subscription in database
async function trackSubscription(
  workspaceId: string,
  email: string,
  tier: string,
  status: string,
  stripeCustomerId: string | null = null,
  stripeSubscriptionId: string | null = null,
  periodEnd: Date | null = null,
  isTrial: boolean = false
) {
  try {
    // Check if user already exists before upserting
    const existing = await q<{ status: string; stripe_subscription_id: string | null }>(
      'SELECT status, stripe_subscription_id FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
      [workspaceId],
    );
    const isNewUser = existing.length === 0;
    if (!incomingMayReplaceSubscriptionRow(existing[0], status, stripeSubscriptionId)) return;

    await q(`
      INSERT INTO user_subscriptions 
        (workspace_id, email, tier, status, stripe_customer_id, stripe_subscription_id,
         current_period_end, is_trial, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (workspace_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, user_subscriptions.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_subscriptions.stripe_subscription_id),
        current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end),
        is_trial = EXCLUDED.is_trial,
        updated_at = NOW()
      WHERE user_subscriptions.status NOT IN ('active', 'trialing', 'past_due', 'unpaid')
         OR (
           EXCLUDED.stripe_subscription_id IS NOT NULL
           AND EXCLUDED.status IN ('active', 'trialing')
         )
         OR EXCLUDED.status = 'trialing'
         OR (
           EXCLUDED.status = 'active'
           AND EXCLUDED.stripe_subscription_id IS NULL
           AND user_subscriptions.status = 'active'
           AND user_subscriptions.stripe_subscription_id IS NULL
         )
    `, [workspaceId, email, tier, status, stripeCustomerId, stripeSubscriptionId, periodEnd, isTrial]);

    // Notify admin of new signups (fire-and-forget)
    if (isNewUser) {
      sendNewSignupNotification(email, tier).catch(() => {});
    }
  } catch (error: unknown) {
    // Login still succeeds. Log the code only: no message, query, or email.
    const code = subscriptionFailureCode(error);
    console.error('[login] Track subscription failed', { code });
  }
}

function subscriptionFailureCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
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
      console.error('Trial check error', { code: subscriptionFailureCode(error) });
    }
  }
  return null;
}

const CUSTOMER_LIST_LIMIT = 100;

async function listCustomersForEmail(email: string): Promise<Stripe.Customer[]> {
  const listed = await stripe.customers.list({ email, limit: CUSTOMER_LIST_LIMIT });
  return listed.data ?? [];
}

function betterPaidSubscription(candidate: Stripe.Subscription, current: Stripe.Subscription): boolean {
  const rank = (status: string) => (status === "active" ? 1 : 0);
  const byStatus = rank(candidate.status) - rank(current.status);
  if (byStatus !== 0) return byStatus > 0;
  const candidateEnd = subscriptionPeriodDate(candidate, "current_period_end")?.getTime() ?? -1;
  const currentEnd = subscriptionPeriodDate(current, "current_period_end")?.getTime() ?? -1;
  if (candidateEnd !== currentEnd) return candidateEnd > currentEnd;
  const candidateCreated = candidate.created ?? -1;
  const currentCreated = current.created ?? -1;
  if (candidateCreated !== currentCreated) return candidateCreated > currentCreated;
  return candidate.id > current.id;
}

async function choosePaidSubscription(customers: Stripe.Customer[]): Promise<{
  customer: Stripe.Customer;
  subscription: Stripe.Subscription;
  valid: Stripe.Subscription[];
} | null> {
  const listed = await Promise.all(customers.map(async (customer) => {
    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: CUSTOMER_LIST_LIMIT });
    const valid = (subs.data ?? []).filter((sub) => sub.status === "active" || sub.status === "trialing");
    return { customer, valid };
  }));
  let best: { customer: Stripe.Customer; subscription: Stripe.Subscription } | null = null;
  for (const entry of listed) {
    for (const subscription of entry.valid) {
      if (!best || betterPaidSubscription(subscription, best.subscription)) {
        best = { customer: entry.customer, subscription };
      }
    }
  }
  if (!best) return null;
  const chosen = best;
  const valid = listed.find((entry) => entry.customer.id === chosen.customer.id)?.valid ?? [chosen.subscription];
  return { customer: chosen.customer, subscription: chosen.subscription, valid };
}

function preferredCustomer(customers: Stripe.Customer[]): Stripe.Customer {
  return [...customers].sort((a, b) => {
    const byCreated = (b.created ?? 0) - (a.created ?? 0);
    if (byCreated !== 0) return byCreated;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

async function readManualGrant(workspaceId: string): Promise<"pro" | "pro_trader" | null> {
  const rows = await q<{
    tier: string;
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  }>(
    `SELECT tier, status, stripe_customer_id, stripe_subscription_id
     FROM user_subscriptions
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.tier !== "pro" && row.tier !== "pro_trader") return null;
  if (row.stripe_customer_id != null || row.stripe_subscription_id != null) return null;
  return row.tier;
}

async function readEmailHashTier(workspaceId: string): Promise<string | null> {
  const rows = await q<{ tier: string | null }>(
    `SELECT tier FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );
  const tier = rows[0]?.tier;
  return tier ? tier : null;
}

async function cancelStaleStripeRows(email: string, customerIds: string[]): Promise<void> {
  if (!customerIds.length) return;
  try {
    // customers.list({ email }) is case-sensitive, while this table matches
    // email case-insensitively. Only cancel customers this login actually listed.
    await q(
      `UPDATE user_subscriptions
       SET status = 'canceled', updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
         AND stripe_subscription_id IS NOT NULL
         AND stripe_customer_id = ANY($2::text[])`,
      [email, customerIds],
    );
  } catch (error: any) {
    if (!error?.message?.includes("does not exist")) {
      console.error('Cancel stale subscription error', { code: subscriptionFailureCode(error) });
    }
  }
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

function getAuthCookieOptions(req: NextRequest, admin = false) {
  const host = req.headers.get("host") || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const maxAge = admin ? 60 * 60 * 24 * 365 : 60 * 60 * 24 * 30;

  if (isLocalhost) {
    return {
      httpOnly: true,
      secure: false,
      sameSite: "lax" as const,
      path: "/",
      maxAge,
    };
  }

  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    domain: ".marketscannerpros.app",
    path: "/",
    maxAge,
  };
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const ip = getClientIP(req);
  const rateCheck = loginLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later.", retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
    );
  }

  try {
    const { email, loginNonce } = await req.json();

    // ========================================
    // SECURITY: Require a valid login nonce from magic-link verification.
    // This prevents direct calls to /api/auth/login with just an email.
    // ========================================
    if (!loginNonce || typeof loginNonce !== "string") {
      return NextResponse.json({ error: "Missing login verification. Please use the sign-in link sent to your email." }, { status: 403 });
    }
    let noncePayload: { purpose?: string; email?: string };
    try {
      noncePayload = verifySessionToken(loginNonce) as { purpose?: string; email?: string };
    } catch {
      return NextResponse.json({ error: "Login verification expired or invalid. Please request a new sign-in link." }, { status: 403 });
    }
    if (noncePayload?.purpose !== "login_nonce" || !noncePayload?.email) {
      return NextResponse.json({ error: "Invalid login verification." }, { status: 403 });
    }

    // Use the email from the verified nonce, not from the request body (prevents tampering)
    const emailFromNonce = noncePayload.email;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailFromNonce || !emailRegex.test(emailFromNonce.trim())) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const normalizedEmail = emailFromNonce.toLowerCase().trim();

    // ========================================
    // ADMIN CHECK: permanent session for admin emails
    // ========================================
    const admin = isAdminEmail(normalizedEmail);
    const sessionDays = admin ? 365 : 30;

    // ========================================
    // STEP 1: Check for active trial FIRST
    // ========================================
    const trial = await checkTrialAccess(normalizedEmail);
    if (trial) {
      // User has an active trial - grant access without Stripe
      const workspaceId = hashWorkspaceId(normalizedEmail);
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * sessionDays;
      const token = signSessionToken({ cid: `trial_${normalizedEmail}`, tier: trial.tier, workspaceId, exp, ...(admin ? { is_admin: true } : {}) });
      
      const daysLeft = Math.ceil((trial.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      // A live Stripe subscription on this workspace must keep its own period.
      // Writing trialing over it would turn the paid row free when the trial ends.
      // If that read fails, skip the trial write. A later SELECT inside
      // trackSubscription can recover, and incomingMayReplaceSubscriptionRow
      // lets status 'trialing' replace a live paid row.
      let liveStripeSub = false;
      let paidRowLookupFailed = false;
      try {
        const paidRow = await q<{ status: string; stripe_subscription_id: string | null }>(
          'SELECT status, stripe_subscription_id FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
          [workspaceId],
        );
        liveStripeSub = paidRow[0]?.stripe_subscription_id != null
          && (paidRow[0].status === 'active' || paidRow[0].status === 'trialing');
      } catch {
        paidRowLookupFailed = true;
        console.error("[login] trial subscription lookup failed");
      }
      if (!paidRowLookupFailed && !liveStripeSub) {
        await trackSubscription(
          workspaceId,
          normalizedEmail,
          trial.tier,
          'trialing',
          null,
          null,
          trial.expiresAt,
          true
        );
      }
      
      const body = { 
        ok: true, 
        tier: trial.tier, 
        workspaceId, 
        message: `Trial activated! ${daysLeft} days remaining.`,
        isTrial: true,
        trialExpiresAt: trial.expiresAt.toISOString()
      };
      
      const res = NextResponse.json(body);
      res.cookies.set("ms_auth", token, getAuthCookieOptions(req, admin));
    
      const originHeader = req.headers.get("origin");
      const headers = corsHeaders(originHeader);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    }

    // ========================================
    // STEP 2: No trial found - check Stripe
    // ========================================
    const customers = await listCustomersForEmail(normalizedEmail);
    if (!customers.length) {
      // No Stripe customer — keep a manual Pro grant on this email's workspace row.
      // Any other row for the same email is ignored.
      const workspaceId = hashWorkspaceId(normalizedEmail);
      let manualTier: "pro" | "pro_trader" | null = null;
      try {
        manualTier = await readManualGrant(workspaceId);
      } catch {
        console.error("[login] manual grant lookup failed");
      }
      const tier = manualTier ?? "free";
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * sessionDays;
      const token = signSessionToken({ cid: `free_${normalizedEmail}`, tier, workspaceId, exp, ...(admin ? { is_admin: true } : {}) });

      if (!manualTier) {
        await trackSubscription(workspaceId, normalizedEmail, "free", "active", null, null, null, false);
      }

      loginLimiter.reset(ip);
      const body = {
        ok: true,
        tier,
        workspaceId,
        message: manualTier ? "Welcome back." : "Welcome! Explore free tools or upgrade for full access.",
      };
      const res = NextResponse.json(body);
      res.cookies.set("ms_auth", token, getAuthCookieOptions(req, admin));
      const originHeader = req.headers.get("origin");
      const headers = corsHeaders(originHeader);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    }
    const paid = await choosePaidSubscription(customers);
    if (!paid) {
      // Stripe customer exists but no active subscription — grant free tier.
      // Cancel rows that still point at a Stripe subscription so an email
      // fallback cannot treat a lapsed row as paid. Null subscription ids stay.
      const workspaceId = hashWorkspaceId(normalizedEmail);
      const customerId = preferredCustomer(customers).id;
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * sessionDays;
      const token = signSessionToken({ cid: customerId, tier: "free", workspaceId, exp, ...(admin ? { is_admin: true } : {}) });
      await cancelStaleStripeRows(normalizedEmail, customers.map((listed) => listed.id));

      loginLimiter.reset(ip);
      const body = { ok: true, tier: "free", workspaceId, message: "Welcome back! Your subscription is inactive. Upgrade to restore full access." };
      const res = NextResponse.json(body);
      res.cookies.set("ms_auth", token, getAuthCookieOptions(req, admin));
      const originHeader = req.headers.get("origin");
      const headers = corsHeaders(originHeader);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    }
    const { customer, subscription: primarySub } = paid;
    const customerId = customer.id;
    const priceIds = (primarySub.items?.data ?? []).map((item) => item.price?.id).filter((id): id is string => Boolean(id));
    const detectedTier = detectTierFromPrices(priceIds);
    const workspaceId = hashWorkspaceId(normalizedEmail);
    let tier = detectedTier;
    let writeStatus = primarySub.status;
    let writeTrial = primarySub.status === "trialing";

    if (detectedTier === "free") {
      console.error("[login] Active subscription price did not match a configured price id", { priceIds });
      let existingTier: string | null = null;
      let tierLookupFailed = false;
      try {
        existingTier = await readEmailHashTier(workspaceId);
      } catch {
        tierLookupFailed = true;
        console.error("[login] stored tier lookup failed");
      }
      if (!tierLookupFailed && existingTier) {
        const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * sessionDays;
        const token = signSessionToken({ cid: customerId, tier: existingTier, workspaceId, exp, ...(admin ? { is_admin: true } : {}) });
        loginLimiter.reset(ip);
        const body: any = { ok: true, tier: existingTier, workspaceId, message: "Subscription activated successfully!" };
        const res = NextResponse.json(body);
        res.cookies.set("ms_auth", token, getAuthCookieOptions(req, admin));
        const originHeader = req.headers.get("origin");
        const headers = corsHeaders(originHeader);
        for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
        return res;
      }
      if (!tierLookupFailed) {
        tier = "free";
        writeStatus = "active";
        writeTrial = false;
      }
    }

    const periodEnd = subscriptionPeriodDate(primarySub, "current_period_end");
    if (!periodEnd) {
      console.error('[login] current_period_end missing or unusable on items.data[0] and on the subscription; storing null');
    }

    // Track subscription in database
    await trackSubscription(
      workspaceId,
      normalizedEmail,
      tier,
      writeStatus,
      customerId,
      primarySub.id,
      periodEnd,
      writeTrial
    );
    
    await stripe.customers.update(customerId, {
      metadata: { marketscanner_tier: tier, workspace_id: workspaceId },
    });
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * sessionDays;
    const token = signSessionToken({ cid: customerId, tier, workspaceId, exp, ...(admin ? { is_admin: true } : {}) });
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";
    const isAdminDebug = debug && isValidAdminSecret(req.headers.get("x-admin-secret"), process.env.ADMIN_SECRET);
    const body: any = { ok: true, tier, workspaceId, message: "Subscription activated successfully!" };
    if (isAdminDebug) {
      body.debug = {
        priceIds,
        env: {
          NEXT_PUBLIC_PRICE_PRO: process.env.NEXT_PUBLIC_PRICE_PRO ?? "",
          NEXT_PUBLIC_PRICE_PRO_TRADER: process.env.NEXT_PUBLIC_PRICE_PRO_TRADER ?? "",
        },
      };
    }
    // Reset rate limit on successful login
    loginLimiter.reset(ip);
    const res = NextResponse.json(body);
    res.cookies.set("ms_auth", token, getAuthCookieOptions(req, admin));
    const originHeader = req.headers.get("origin");
    const headers = corsHeaders(originHeader);
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error('Login error', { code: subscriptionFailureCode(err) });
    const errRes = NextResponse.json({ error: "Authentication failed. Please try again." }, { status: 500 });
    const originHeader = req.headers.get("origin");
    const headers = corsHeaders(originHeader);
    for (const [k, v] of Object.entries(headers)) errRes.headers.set(k, v);
    return errRes;
  }
}

export async function OPTIONS(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}
