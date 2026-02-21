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
import { getSessionFromCookie } from '@/lib/auth';

export type RateLimitPreset = 'api' | 'scanner' | 'ai' | 'login';

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

      // 2. Auth check
      if (requireAuth || requireTier) {
        const session = await getSessionFromCookie();
        if (!session?.workspaceId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (requireTier === 'pro_trader') {
          const tier = session.tier || 'free';
          if (tier !== 'pro_trader') {
            return NextResponse.json(
              { error: 'Pro Trader subscription required' },
              { status: 403 },
            );
          }
        } else if (requireTier === 'pro') {
          const tier = session.tier || 'free';
          if (tier !== 'pro' && tier !== 'pro_trader') {
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
