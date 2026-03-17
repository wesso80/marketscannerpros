export type AppTier = "free" | "pro" | "pro_trader";

export const AI_DAILY_LIMITS: Record<AppTier, number> = {
  free: 10,
  pro: 50,
  pro_trader: 50,
};

/** Model selection per tier — Pro Trader gets GPT-4.1 for superior analysis */
export const AI_MODEL_BY_TIER: Record<AppTier, string> = {
  free: 'gpt-4o-mini',
  pro: 'gpt-4o-mini',
  pro_trader: 'gpt-4.1',
};

// Admin emails — hardcoded + env var for guaranteed access
const HARDCODED_ADMINS = ['xxneutronxx@yahoo.com', 'bradleywessling@yahoo.com.au'];
const ENV_ADMINS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = [...new Set([...HARDCODED_ADMINS, ...ENV_ADMINS])];

export function isFreeForAllMode(): boolean {
  return process.env.FREE_FOR_ALL_MODE === "true";
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
  return normalizeTier(tier) !== "free";
}

/**
 * Resolve the effective tier for a workspace using the same logic as /api/me:
 *  1) FREE_FOR_ALL_MODE → pro_trader
 *  2) Admin email → pro_trader
 *  3) DB user_subscriptions tier (source of truth from Stripe)
 *  4) Fallback to cookie tier
 */
export async function getEffectiveTier(
  workspaceId: string,
  cookieTier: string,
  cid?: string,
  dbQuery?: <T>(sql: string, params: unknown[]) => Promise<T[]>
): Promise<AppTier> {
  if (isFreeForAllMode()) return 'pro_trader';

  // Need db access for subscription + admin checks
  if (!dbQuery) return normalizeTier(cookieTier);

  try {
    const rows = await dbQuery<{ email: string; tier: string; status: string }>(
      'SELECT email, tier, status FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
      [workspaceId]
    );
    const dbSub = rows.length > 0 ? rows[0] : null;

    // Check admin by email from DB or cid
    const email = dbSub?.email || cid || '';
    if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return 'pro_trader';

    if (dbSub) {
      // Cancelled/inactive → free
      if (dbSub.status !== 'active' && dbSub.status !== 'trialing') return 'free';
      return normalizeTier(dbSub.tier);
    }
  } catch {
    // DB error — fall through to cookie tier
  }

  return normalizeTier(cookieTier);
}