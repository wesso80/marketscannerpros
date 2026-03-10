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

export type RateLimitPreset = 'api' | 'scanner' | 'ai' | 'login';

// ─── S2 FIX: Refresh tier from DB with 5-minute cache ───────────────────────
const tierCache = new Map<string, { tier: string; status: string; ts: number }>();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getVerifiedTier(session: SessionPayload): Promise<string> {
  const wid = session.workspaceId;
  const now = Date.now();
  const cached = tierCache.get(wid);
  if (cached && now - cached.ts < TIER_CACHE_TTL_MS) {
    return cached.tier;
  }

  try {
    const rows = await q<{ tier: string; status: string }>(
      `SELECT tier, status FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
      [wid],
    );
    if (rows.length > 0) {
      const { tier, status } = rows[0];
      // If subscription is cancelled / past_due / unpaid, treat as free
      const effectiveTier = (status === 'active' || status === 'trialing') ? tier : 'free';
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
  requireTier?: 'pro' | 'pro_trader';
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

        if (requireTier === 'pro_trader') {
          if (verifiedTier !== 'pro_trader') {
            return NextResponse.json(
              { error: 'Pro Trader subscription required' },
              { status: 403 },
            );
          }
        } else if (requireTier === 'pro') {
          if (verifiedTier !== 'pro' && verifiedTier !== 'pro_trader') {
            return NextResponse.json(
              { error: 'Pro subscription required' },
              { status: 403 },
            );
          }
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
