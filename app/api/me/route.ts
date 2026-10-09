// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { effectiveTierFromSubscription, isFreeForAllMode } from "@/lib/entitlements";
import { chooseAccessSubscription, emailFromSessionCid } from "@/lib/subscriptionRow";

// Admin emails — hardcoded + env var for guaranteed access
const HARDCODED_ADMINS = ['xxneutronxx@yahoo.com', 'bradleywessling@yahoo.com.au'];
const ENV_ADMINS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = [...new Set([...HARDCODED_ADMINS, ...ENV_ADMINS])];

type SubRow = {
  email: string;
  tier: string;
  status: string;
  current_period_end: Date | string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  updated_at?: Date | string | null;
  created_at?: Date | string | null;
  id?: number | null;
};

const SUB_COLUMNS = 'email, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at, created_at, id';

async function getSubscriptionFromDB(workspaceId: string, cid: string | undefined): Promise<SubRow | null> {
  try {
    const workspaceRows = await q<SubRow>(
      `SELECT ${SUB_COLUMNS} FROM user_subscriptions WHERE workspace_id = $1`,
      [workspaceId]
    );
    const email = emailFromSessionCid(cid) ?? workspaceRows.find((row) => row.email)?.email ?? null;
    let otherRows: SubRow[] = [];
    if (email) {
      otherRows = await q<SubRow>(
        `SELECT ${SUB_COLUMNS} FROM user_subscriptions WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
    } else if (cid?.startsWith('cus_')) {
      otherRows = await q<SubRow>(
        `SELECT ${SUB_COLUMNS} FROM user_subscriptions WHERE stripe_customer_id = $1`,
        [cid]
      );
    }
    return chooseAccessSubscription(workspaceRows, otherRows);
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

  // Check DB for current subscription (source of truth for tier).
  // A free workspace row does not hide another active paid row for the same email.
  const dbSub = await getSubscriptionFromDB(session.workspaceId, session.cid);
  
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
  // 3) DB row via effectiveTierFromSubscription (status + trial period end)
  // 4) Fall back to cookie tier only if no DB record exists
  let effectiveTier = dbSub ? effectiveTierFromSubscription(dbSub) : session.tier;
  
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
