// lib/auth.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { q } from './db';
import { effectiveTierFromSubscription, isFreeForAllMode } from './entitlements';
import { chooseAccessSubscription, emailFromSessionCid } from './subscriptionRow';
import { hashWorkspaceId } from './workspaceHash';

const isProductionRuntime = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

if (!process.env.APP_SIGNING_SECRET && isProductionRuntime) {
  throw new Error("APP_SIGNING_SECRET environment variable is required");
}

const APP_SIGNING_SECRET: string = process.env.APP_SIGNING_SECRET || 'msp-local-dev-signing-secret-do-not-use-in-production';

/** Stripe/Postgres `code` only. Never the message, the query, or the thrown object. */
export function loggedErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

function verify(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null;
  } catch {
    return null; // Length mismatch or encoding error
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as { cid: string; tier: string; workspaceId: string; exp: number };
  } catch {
    return null; // Malformed JSON
  }
}

export interface SessionPayload {
  cid: string;
  tier: string;
  workspaceId: string;
  exp: number;
  iat?: number;
  is_admin?: boolean;
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get("ms_auth")?.value;
  if (!c) {
    // Two distinct no-session bypasses:
    //  • DEV_AUTH_BYPASS — local testing only, must NEVER run in production.
    //  • FREE_FOR_ALL_MODE — time-boxed promo that MAY run in production, but only
    //    because isFreeForAllMode() already requires ALLOW_PROD_ACCESS_BYPASS=true
    //    there (an explicit operator opt-in), so it grants anonymous pro_trader.
    const devBypass =
      process.env.NODE_ENV === 'development' && !isProductionRuntime && process.env.DEV_AUTH_BYPASS === 'true';
    const freeForAll = isFreeForAllMode();

    if (devBypass || freeForAll) {
      // The dev bypass is still hard-blocked in production; FFA is the only path
      // permitted to grant an anonymous session in production.
      if (isProductionRuntime && !freeForAll) {
        console.error('[auth] CRITICAL: dev bypass triggered in production runtime — request denied');
        return null;
      }
      if (freeForAll) {
        console.warn('[auth] FREE_FOR_ALL_MODE active — granting anonymous pro_trader access');
      } else {
        console.warn(
          '[auth] ⚠️  DEV BYPASS ACTIVE — granting pro_trader tier automatically. ' +
          'This must NEVER run in production. Set DEV_AUTH_BYPASS=false or unset it before deploying.',
        );
      }
      // Use ms_anon cookie (set by middleware) so each browser gets its own workspace
      const anonId = cookieStore.get('ms_anon')?.value || 'anonymous';
      return {
        cid: `anon-${anonId}`,
        tier: 'pro_trader',
        workspaceId: hashWorkspaceId(`anon-${anonId}`),
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
      };
    }
    return null;
  }
  const session = verify(c);
  if (!session) return null;
  // trial_ cookies stay valid for 30 days, so a 7-day trial would keep Pro on
  // cookie readers long after current_period_end. Read the workspace row directly.
  // Do not call getVerifiedTier: apiMiddleware imports this module.
  if (session.cid.startsWith('trial_') && session.workspaceId) {
    try {
      const columns = 'workspace_id, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at, created_at, id';
      const email = emailFromSessionCid(session.cid);
      // Same recency order as chooseAccessSubscription's no-Stripe fallback
      // (updated_at, then created_at, then id). The helper still prefers a
      // live Stripe row over this order.
      const subscriptionOrder = 'ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC';
      const rows = await q<{ workspace_id?: string | null; tier: string; status: string; current_period_end: Date | string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; updated_at?: Date | string | null; created_at?: Date | string | null; id?: number | null }>(
        email
          ? `SELECT ${columns} FROM user_subscriptions WHERE workspace_id = $1 OR LOWER(email) = LOWER($2) ${subscriptionOrder}`
          : `SELECT ${columns} FROM user_subscriptions WHERE workspace_id = $1 ${subscriptionOrder}`,
        email ? [session.workspaceId, email] : [session.workspaceId],
      );
      const workspaceRows = rows.filter((row) => row.workspace_id === session.workspaceId);
      const otherRows = rows.filter((row) => row.workspace_id !== session.workspaceId);
      const row = chooseAccessSubscription(workspaceRows, otherRows);
      // An active row whose current_period_end is in the past stays as signed.
      // Manual grants are active and have no Stripe subscription; a past or
      // null end on those rows is still Pro. Downgrading an active Stripe row
      // from the stored end alone would cut off a payer without asking Stripe.
      // Same period rule as the entitlement helper. Only a lapsed trial is
      // downgraded here; the cookie tier is left as signed otherwise.
      // A duplicate active paid row wins over an expired trial on this workspace.
      if (row?.status === 'trialing' && effectiveTierFromSubscription(row) === 'free') session.tier = 'free';
    } catch (err) {
      console.error('[auth] trial subscription read failed', { code: loggedErrorCode(err) });
    }
  }
  return session;
}

// hashWorkspaceId lives in lib/workspaceHash.ts (pure, no cookie/secret dependency) so access
// helpers can use it without loading this module; re-exported here for existing imports.
export { hashWorkspaceId };

export function signSessionToken(payload: object): string {
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat })).toString("base64url");
  const sig = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
// verifySessionToken uses same APP_SIGNING_SECRET as signSessionToken for consistency
export function verifySessionToken(t: string): Record<string, unknown> {
  if (!t || typeof t !== "string") throw new Error("No token");
  const [p, sig] = t.split("."); if (!p || !sig) throw new Error("Malformed");
  const expSig = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(p).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expSig, 'base64url'))) throw new Error("Bad signature");
  } catch (err) {
    console.error('[auth] verifySessionToken signature check failed');
    throw new Error("Bad signature");
  }
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (payload?.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  return payload;
}
