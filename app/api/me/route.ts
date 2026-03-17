// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { isFreeForAllMode } from "@/lib/entitlements";

// Admin emails — hardcoded + env var for guaranteed access
const HARDCODED_ADMINS = ['xxneutronxx@yahoo.com', 'bradleywessling@yahoo.com.au'];
const ENV_ADMINS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = [...new Set([...HARDCODED_ADMINS, ...ENV_ADMINS])];

async function getSubscriptionFromDB(workspaceId: string): Promise<{ email: string; tier: string; status: string } | null> {
  try {
    const rows = await q<{ email: string; tier: string; status: string }>(
      'SELECT email, tier, status FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
      [workspaceId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

// Extract email from cid (formats: "trial_email@example.com", "free_email@example.com", or "email@example.com")
function extractEmailFromCid(cid: string): string | null {
  if (cid.startsWith('trial_')) {
    return cid.substring(6); // Remove "trial_" prefix
  }
  if (cid.startsWith('free_')) {
    return cid.substring(5); // Remove "free_" prefix
  }
  // Check if cid itself looks like an email
  if (cid.includes('@')) {
    return cid;
  }
  return null;
}

export async function GET() {
  const session = await getSessionFromCookie();
  
  if (!session) {
    return NextResponse.json({ 
      tier: "free", 
      workspaceId: null,
      authenticated: false,
      isAdmin: false,
      email: null
    });
  }

  // Check DB for current subscription (source of truth for tier)
  let dbSub = await getSubscriptionFromDB(session.workspaceId);
  
  // Fallback: look up by Stripe customer ID if workspace_id miss
  if (!dbSub && session.cid && session.cid.startsWith('cus_')) {
    try {
      const rows = await q<{ email: string; tier: string; status: string }>(
        'SELECT email, tier, status FROM user_subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
        [session.cid]
      );
      dbSub = rows.length > 0 ? rows[0] : null;
    } catch { /* ignore */ }
  }
  
  let email = dbSub?.email ?? null;
  
  // Fallback: extract email from cid (for trial users without DB row yet)
  if (!email && session.cid) {
    email = extractEmailFromCid(session.cid);
  }
  
  // Check if user is admin
  const isAdmin = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  // Determine effective tier:
  // 1) FREE_FOR_ALL_MODE → everyone gets pro_trader
  // 2) Admin users always get pro_trader
  // 3) DB tier is source of truth (reflects Stripe webhook updates / cancellations)
  // 4) Fall back to cookie tier only if no DB record exists
  let effectiveTier = dbSub?.tier ?? session.tier;
  
  // If subscription is cancelled/inactive in DB, downgrade to free
  if (dbSub && dbSub.status !== 'active' && dbSub.status !== 'trialing') {
    effectiveTier = 'free';
  }
  
  if (isFreeForAllMode()) {
    effectiveTier = "pro_trader";
  } else if (isAdmin) {
    effectiveTier = "pro_trader";
  }

  return NextResponse.json({ 
    tier: effectiveTier, 
    workspaceId: session.workspaceId,
    authenticated: true,
    isAdmin,
    email: email || null
  });
}
