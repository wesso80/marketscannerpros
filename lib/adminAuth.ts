import crypto from 'crypto';
import { cookies } from 'next/headers';
import { hashWorkspaceId, signSessionToken, verifySessionToken } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';

export const ADMIN_SESSION_COOKIE = 'ms_admin';
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

export type AdminAuthResult = {
  ok: boolean;
  source?: 'admin_session' | 'app_session' | 'admin_secret';
  cid?: string;
  workspaceId?: string;
};

/**
 * Timing-safe comparison for admin secrets / cron tokens.
 * Avoids timing attacks by using constant-time comparison.
 */
export function isValidAdminSecret(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    // Length mismatch
    return false;
  }
}

/**
 * Verify cron authorization header against CRON_SECRET env var.
 * Used by all /api/jobs/* routes.
 */
export function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[verifyCronAuth] CRON_SECRET env var is not set');
    return false;
  }

  // Read x-cron-secret directly first (what cron curl sends), fall back to authorization
  const cronHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const token = cronHeader || authHeader || '';
  const stripped = token.replace(/^Bearer\s+/i, '');

  if (!stripped) {
    console.error(`[verifyCronAuth] No auth token found. x-cron-secret present: ${!!cronHeader}, authorization present: ${!!authHeader}`);
    return false;
  }

  const valid = isValidAdminSecret(stripped, cronSecret);
  if (!valid) {
    console.error(`[verifyCronAuth] Token mismatch. token length: ${stripped.length}, expected length: ${cronSecret.length}`);
  }
  return valid;
}

/**
 * Verify admin secret header.
 */
export function verifyAdminAuth(request: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;

  const header = request.headers.get('x-admin-secret') ?? request.headers.get('authorization') ?? '';
  const stripped = header.replace(/^Bearer\s+/i, '');
  return isValidAdminSecret(stripped, adminSecret);
}

export function createAdminSessionToken(subject: string = 'admin_secret'): string {
  const cid = subject.startsWith('admin_') ? subject : `admin_${subject}`;
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE;
  return signSessionToken({ kind: 'admin', cid, tier: 'admin', workspaceId: hashWorkspaceId(cid), exp });
}

export function getAdminSessionCookieOptions(request: Request) {
  const host = request.headers.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  return isLocalhost
    ? { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/', maxAge: ADMIN_SESSION_MAX_AGE }
    : { httpOnly: true, secure: true, sameSite: 'lax' as const, domain: '.marketscannerpros.app', path: '/', maxAge: ADMIN_SESSION_MAX_AGE };
}

async function verifyAdminSessionCookie(): Promise<AdminAuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return { ok: false };

  try {
    const payload = verifySessionToken(token);
    if (payload.kind !== 'admin') return { ok: false };
    return {
      ok: true,
      source: 'admin_session',
      cid: typeof payload.cid === 'string' ? payload.cid : undefined,
      workspaceId: typeof payload.workspaceId === 'string' ? payload.workspaceId : undefined,
    };
  } catch {
    return { ok: false };
  }
}

export async function verifyAdminRequest(request: Request): Promise<AdminAuthResult> {
  const adminSession = await verifyAdminSessionCookie();
  if (adminSession.ok) return adminSession;

  const cookieStore = await cookies();
  const appToken = cookieStore.get('ms_auth')?.value;
  if (appToken) {
    try {
      const payload = verifySessionToken(appToken);
      const cid = typeof payload.cid === 'string' ? payload.cid : '';
      const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : undefined;
      if (cid && isOperator(cid, workspaceId)) {
        return { ok: true, source: 'app_session', cid, workspaceId };
      }
    } catch {
      // Fall through to temporary legacy header support.
    }
  }

  if (verifyAdminAuth(request)) {
    return { ok: true, source: 'admin_secret', cid: 'admin_secret', workspaceId: hashWorkspaceId('admin_secret') };
  }

  return { ok: false };
}

export async function requireAdmin(request: Request): Promise<AdminAuthResult> {
  return verifyAdminRequest(request);
}
