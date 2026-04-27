// lib/auth.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { isFreeForAllMode } from '@/lib/entitlements';

const isProductionRuntime = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

if (!process.env.APP_SIGNING_SECRET && isProductionRuntime) {
  throw new Error("APP_SIGNING_SECRET environment variable is required");
}

const APP_SIGNING_SECRET: string = process.env.APP_SIGNING_SECRET || 'msp-local-dev-signing-secret-do-not-use-in-production';

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
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get("ms_auth")?.value;
  if (!c) {
    // DEV BYPASS: auto-authenticate as pro_trader for local testing
    if (
      (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true') ||
      isFreeForAllMode()
    ) {
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
  return verify(c);
}

export function hashWorkspaceId(customerId: string): string {
  // Deterministic, stable workspace id derived from Stripe customer id (UUID format)
  const hashBytes = crypto.createHash("sha256").update(customerId).digest();
  // Format as UUID: 8-4-4-4-12 characters
  return `${hashBytes.subarray(0, 4).toString('hex')}-${hashBytes.subarray(4, 6).toString('hex')}-${hashBytes.subarray(6, 8).toString('hex')}-${hashBytes.subarray(8, 10).toString('hex')}-${hashBytes.subarray(10, 16).toString('hex')}`;
}

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
    console.error('[auth] verifySessionToken signature check failed:', err instanceof Error ? err.message : err);
    throw new Error("Bad signature");
  }
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (payload?.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  return payload;
}
