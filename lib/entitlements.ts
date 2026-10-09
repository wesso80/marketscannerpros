import { isPaidTier } from "./tiers";
import { chooseAccessSubscription, emailFromSessionCid } from "./subscriptionRow";
export type AppTier = "free" | "pro" | "pro_trader";

export const AI_DAILY_LIMITS: Record<AppTier, number> = {
  free: 10,
  pro: 20,
  pro_trader: 20,
};

/** Model selection per tier — Pro (incl. legacy pro_trader) gets GPT-4.1; Free stays on gpt-4o-mini */
export const AI_MODEL_BY_TIER: Record<AppTier, string> = {
  free: 'gpt-4o-mini',
  pro: 'gpt-4.1',
  pro_trader: 'gpt-4.1',
};

// Admin emails — env var only (ADMIN_EMAILS=a@b.com,c@d.com)
// Hardcoded fallbacks have been removed; configure via environment variable.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export function isFreeForAllMode(nowMs: number = Date.now()): boolean {
  if (process.env.FREE_FOR_ALL_MODE !== "true") return false;
  if (isProductionRuntime() && process.env.ALLOW_PROD_ACCESS_BYPASS !== "true") {
    console.error('[access] FREE_FOR_ALL_MODE ignored in production because ALLOW_PROD_ACCESS_BYPASS is not true');
    return false;
  }
  // Optional auto-expiry for time-boxed promotions (e.g. a 2-week free-for-all).
  // If FREE_FOR_ALL_UNTIL is set to a valid timestamp, the mode disables itself
  // once that time has passed so the platform can never stay free indefinitely.
  const untilRaw = process.env.FREE_FOR_ALL_UNTIL;
  if (untilRaw) {
    const untilMs = Date.parse(untilRaw);
    if (!Number.isFinite(untilMs)) {
      console.error(`[access] FREE_FOR_ALL_MODE ignored because FREE_FOR_ALL_UNTIL is not a valid timestamp: ${untilRaw}`);
      return false;
    }
    if (nowMs > untilMs) return false;
  }
  return true;
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER_SERVICE_NAME || process.env.RENDER_EXTERNAL_URL);
}

export function isProductionAccessBypassAllowed(): boolean {
  return !isProductionRuntime() || process.env.ALLOW_PROD_ACCESS_BYPASS === 'true';
}

/**
 * Public-safe status for the free-for-all promotion. Exposes only whether the
 * promo is currently active and when it ends — no internal scores/watchlists.
 */
export function getFreeForAllPromo(nowMs: number = Date.now()): { active: boolean; endsAt: string | null } {
  const active = isFreeForAllMode(nowMs);
  const untilRaw = process.env.FREE_FOR_ALL_UNTIL;
  let endsAt: string | null = null;
  if (untilRaw) {
    const untilMs = Date.parse(untilRaw);
    if (Number.isFinite(untilMs)) endsAt = new Date(untilMs).toISOString();
  }
  return { active, endsAt };
}

export function normalizeTier(tier: string | null | undefined): AppTier {
  if (tier === "pro_trader") return "pro_trader";
  if (tier === "pro") return "pro";
  return "free";
}

export function getDailyAiLimit(tier: string | null | undefined): number {
  return AI_DAILY_LIMITS[normalizeTier(tier)];
}

export function hasProAccess(tier: string | null | undefined): boolean {
  return isPaidTier(tier);
}

/** One `user_subscriptions` row, as the entitlement gates read it. */
export type SubscriptionAccessRow = {
  tier?: string | null;
  status?: string | null;
  current_period_end?: Date | string | number | null;
};

function periodEndMillis(value: SubscriptionAccessRow['current_period_end']): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Tier one subscription row grants.
 *
 * A `trialing` row is Pro only while `current_period_end` is still ahead of
 * `nowMs` (the end instant itself is still Pro). A past end is Free.
 * A `trialing` row with a missing or unreadable end is Free: a trial is a
 * time box, and login always stores the end, so a blank end is not an open
 * trial. Leaving it Pro would keep the same "trialing forever" hole.
 * An `active` row ignores `current_period_end`, so a manual `pro_trader` /
 * `pro` grant with a NULL end stays Pro, and a past end on a paid row does not
 * downgrade it.
 */
export function effectiveTierFromSubscription(
  row: SubscriptionAccessRow,
  nowMs: number = Date.now(),
): AppTier {
  const status = row.status;
  if (status !== 'active' && status !== 'trialing') return 'free';
  if (status === 'trialing') {
    const endMs = periodEndMillis(row.current_period_end);
    if (endMs == null || endMs < nowMs) return 'free';
  }
  return normalizeTier(row.tier);
}

/**
 * Extract email from session cid (may be prefixed with trial_ or free_)
 */
function extractEmailFromCid(cid: string): string | null {
  if (cid.startsWith('trial_')) return cid.substring(6);
  if (cid.startsWith('free_')) return cid.substring(5);
  if (cid.includes('@')) return cid;
  return null;
}

/**
 * Resolve the effective tier for a workspace using the same logic as /api/me:
 *  1) FREE_FOR_ALL_MODE → pro_trader
 *  2) Admin email → pro_trader
 *  3) DB user_subscriptions tier by workspace_id
 *  4) DB user_subscriptions tier by stripe_customer_id (cid for Stripe users)
 *  5) DB user_subscriptions tier by email (from cid for trial/free users)
 *  6) Fallback to cookie tier
 */
export async function getEffectiveTier(
  workspaceId: string,
  cookieTier: string,
  cid?: string,
  dbQuery?: <T>(sql: string, params: unknown[]) => Promise<T[]>
): Promise<AppTier> {
  if (isFreeForAllMode()) return 'pro_trader';

  // Check admin by cid (email may be embedded in cid as trial_email or free_email)
  if (cid) {
    const emailFromCid = extractEmailFromCid(cid);
    if (emailFromCid && ADMIN_EMAILS.includes(emailFromCid.toLowerCase())) return 'pro_trader';
  }

  // Need db access for subscription check
  if (!dbQuery) return normalizeTier(cookieTier);

  try {
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
    const columns = 'email, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at, created_at, id';
    // Workspace row first. A second row for the same email (different workspace_id) is included below.
    const workspaceRows = await dbQuery<SubRow>(
      `SELECT ${columns} FROM user_subscriptions WHERE workspace_id = $1`,
      [workspaceId]
    );
    let otherRows: SubRow[] = [];
    const emailFromCid = emailFromSessionCid(cid) ?? extractEmailFromCid(cid ?? '');
    const email = emailFromCid || workspaceRows.find((row) => row.email)?.email || null;
    if (email) {
      otherRows = await dbQuery<SubRow>(
        `SELECT ${columns} FROM user_subscriptions WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
    } else if (cid && cid.startsWith('cus_')) {
      otherRows = await dbQuery<SubRow>(
        `SELECT ${columns} FROM user_subscriptions WHERE stripe_customer_id = $1`,
        [cid]
      );
    }
    const dbSub = chooseAccessSubscription(workspaceRows, otherRows);

    if (dbSub) {
      // Check admin by DB email
      if (dbSub.email && ADMIN_EMAILS.includes(dbSub.email.toLowerCase())) return 'pro_trader';
      return effectiveTierFromSubscription(dbSub);
    }
  } catch (err) {
    console.error('[getEffectiveTier] DB error:', err);
  }

  console.warn(`[getEffectiveTier] No DB sub found for ws=${workspaceId.substring(0, 8)} cid=${cid} — falling back to cookie tier=${cookieTier}`);
  return normalizeTier(cookieTier);
}