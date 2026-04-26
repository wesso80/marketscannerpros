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
  if (process.env.FREE_FOR_ALL_MODE !== "true") return false;
  if (isProductionRuntime() && process.env.ALLOW_PROD_ACCESS_BYPASS !== "true") {
    console.error('[access] FREE_FOR_ALL_MODE ignored in production because ALLOW_PROD_ACCESS_BYPASS is not true');
    return false;
  }
  return true;
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER_SERVICE_NAME || process.env.RENDER_EXTERNAL_URL);
}

export function isProductionAccessBypassAllowed(): boolean {
  return !isProductionRuntime() || process.env.ALLOW_PROD_ACCESS_BYPASS === 'true';
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
    // 1) Try by workspace_id (primary key — fastest path)
    const rows = await dbQuery<{ email: string; tier: string; status: string }>(
      'SELECT email, tier, status FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
      [workspaceId]
    );
    let dbSub = rows.length > 0 ? rows[0] : null;

    // 2) No row by workspace_id — try by stripe_customer_id
    //    For Stripe users, cid IS the Stripe customer ID (cus_xxxxx)
    if (!dbSub && cid && cid.startsWith('cus_')) {
      const byCust = await dbQuery<{ email: string; tier: string; status: string }>(
        'SELECT email, tier, status FROM user_subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
        [cid]
      );
      dbSub = byCust.length > 0 ? byCust[0] : null;
      if (dbSub) {
        console.info(`[getEffectiveTier] Found sub by stripe_customer_id=${cid} (workspace_id miss)`);
      }
    }

    // 3) No row by stripe_customer_id — try by email (for trial/free users)
    if (!dbSub && cid) {
      const emailFromCid = extractEmailFromCid(cid);
      if (emailFromCid) {
        const byEmail = await dbQuery<{ email: string; tier: string; status: string }>(
          'SELECT email, tier, status FROM user_subscriptions WHERE LOWER(email) = LOWER($1) AND (status = $2 OR status = $3) ORDER BY tier DESC LIMIT 1',
          [emailFromCid, 'active', 'trialing']
        );
        dbSub = byEmail.length > 0 ? byEmail[0] : null;
        if (dbSub) {
          console.info(`[getEffectiveTier] Found sub by email=${emailFromCid} (workspace_id miss)`);
        }
      }
    }

    if (dbSub) {
      // Check admin by DB email
      if (dbSub.email && ADMIN_EMAILS.includes(dbSub.email.toLowerCase())) return 'pro_trader';
      // Cancelled/inactive → free
      if (dbSub.status !== 'active' && dbSub.status !== 'trialing') return 'free';
      return normalizeTier(dbSub.tier);
    }
  } catch (err) {
    console.error('[getEffectiveTier] DB error:', err);
  }

  console.warn(`[getEffectiveTier] No DB sub found for ws=${workspaceId.substring(0, 8)} cid=${cid} — falling back to cookie tier=${cookieTier}`);
  return normalizeTier(cookieTier);
}