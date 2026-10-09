/**
 * API Route Middleware Wrapper
 *
 * Provides composable middleware for Next.js API route handlers:
 * - Rate limiting (via in-memory sliding window)
 * - Auth checks
 * - Error boundary with structured logging
 *
 * Usage:
 *   export const POST = withApiMiddleware(handler, { rateLimit: 'api' });
 *   export const GET = withApiMiddleware(handler, { rateLimit: 'scanner', requireAuth: true });
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiLimiter, scannerLimiter, aiLimiter, loginLimiter, getClientIP, createRateLimiter } from '@/lib/rateLimit';
import { getSessionFromCookie, SessionPayload } from '@/lib/auth';
import { q } from '@/lib/db';
import { effectiveTierFromSubscription } from '@/lib/entitlements';
import { chooseAccessSubscription, emailFromSessionCid } from '@/lib/subscriptionRow';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { registerMemoryGauge } from '@/lib/memory/debugLog';

export type RateLimitPreset = 'api' | 'scanner' | 'ai' | 'login';

// ─── S2 FIX: Refresh tier from DB with 5-minute cache ───────────────────────
const tierCache = new Map<string, { tier: string; status: string; ts: number }>();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Workspace tier rows held in this process. Expired rows stay until that workspace is read again. */
export function verifiedTierCacheSize(): number {
  return tierCache.size;
}

registerMemoryGauge('tierCache', () => ({ entries: verifiedTierCacheSize() }));

export async function getVerifiedTier(session: SessionPayload): Promise<string> {
  // DEV BYPASS: skip DB lookup for dev session
  if (process.env.NODE_ENV === 'development' && session.cid === 'dev-local-testing') {
    return 'pro_trader';
  }

  const wid = session.workspaceId;
  const now = Date.now();
  const cached = tierCache.get(wid);
  if (cached && now - cached.ts < TIER_CACHE_TTL_MS) {
    return cached.tier;
  }

  try {
    const columns = 'tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at, created_at, id, email';
    const workspaceRows = await q<{ tier: string; status: string; current_period_end: Date | string | null; email?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; updated_at?: Date | string | null; created_at?: Date | string | null; id?: number | null }>(
      `SELECT ${columns} FROM user_subscriptions WHERE workspace_id = $1`,
      [wid],
    );
    const email = emailFromSessionCid(session.cid) ?? workspaceRows.find((row) => row.email)?.email ?? null;
    const otherRows = email
      ? await q<typeof workspaceRows[number]>(
        `SELECT ${columns} FROM user_subscriptions WHERE LOWER(email) = LOWER($1)`,
        [email],
      )
      : session.cid.startsWith('cus_')
        ? await q<typeof workspaceRows[number]>(
          `SELECT ${columns} FROM user_subscriptions WHERE stripe_customer_id = $1`,
          [session.cid],
        )
        : [];
    const chosen = chooseAccessSubscription(workspaceRows, otherRows, now);
    if (chosen) {
      const { status } = chosen;
      // Cancelled / past_due / unpaid, and trials past current_period_end, are free.
      const effectiveTier = effectiveTierFromSubscription(chosen, now);
      tierCache.set(wid, { tier: effectiveTier, status, ts: now });
      return effectiveTier;
    }
  } catch (err: any) {
    // Table might not exist yet — fall back to cookie tier
    if (!err?.message?.includes('does not exist')) {
      console.error('[api-middleware] tier refresh error:', err);
    }
  }

  // Fallback: trust the cookie tier (e.g. if DB row doesn't exist yet)
  return session.tier || 'free';
}
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiMiddlewareOptions {
  /** Which pre-configured rate limiter to apply. Default: 'api' */
  rateLimit?: RateLimitPreset | false;
  /** Require a valid session cookie. Default: false */
  requireAuth?: boolean;
  /** Require a specific tier (implies requireAuth). Default: undefined */
  requireTier?: 'pro';
}

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse | Response>;

const limiters = {
  api: apiLimiter,
  scanner: scannerLimiter,
  ai: aiLimiter,
  login: loginLimiter,
} as const;

/**
 * Wrap a Next.js route handler with middleware layers.
 */
export function withApiMiddleware(
  handler: RouteHandler,
  options: ApiMiddlewareOptions = {},
): RouteHandler {
  const { rateLimit = 'api', requireAuth = false, requireTier } = options;

  return async (req: NextRequest, ctx?: any): Promise<NextResponse | Response> => {
    try {
      // 1. Rate limiting
      if (rateLimit !== false) {
        const limiter = limiters[rateLimit];
        const ip = getClientIP(req);
        const rl = limiter.check(ip);
        if (!rl.allowed) {
          return NextResponse.json(
            { error: 'Too many requests. Please slow down.', retryAfter: rl.retryAfter },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
          );
        }
      }

      // 2. Auth check (with S2 fix: verify tier from DB, not just cookie)
      if (requireAuth || requireTier) {
        const session = await getSessionFromCookie();
        if (!session?.workspaceId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Refresh tier from user_subscriptions table (cached 5 min)
        const verifiedTier = await getVerifiedTier(session);

        // Two access levels only: any required tier means Pro (legacy pro_trader and admins pass).
        if (requireTier && !hasPaidSessionAccess({ ...session, tier: verifiedTier })) {
          return NextResponse.json(
            { error: 'Pro subscription required' },
            { status: 403 },
          );
        }
      }

      // 3. Execute handler
      return await handler(req, ctx);
    } catch (err) {
      console.error(`[api-middleware] Unhandled error in ${req.nextUrl.pathname}:`, err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}
