import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_SIGNING_SECRET = process.env.APP_SIGNING_SECRET!;
const ONE_DAY = 60 * 60 * 24;

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function signToken(payload: object) {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const sig = await hmacSha256(APP_SIGNING_SECRET, body);
  return `${body}.${sig}`;
}

async function verify(token: string) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacSha256(APP_SIGNING_SECRET, body);
  if (sig !== expected) return null;

  const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(json) as {
    cid: string;
    tier: string;
    workspaceId: string;
    exp: number;
  };

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ─── Global API rate limiter (Edge-compatible, in-memory) ───
const GLOBAL_API_WINDOW_MS = 60_000;
const GLOBAL_API_MAX = 300;

const apiHits = new Map<string, { count: number; windowStart: number }>();

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}

function isApiRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = apiHits.get(ip);
  if (!entry || now - entry.windowStart > GLOBAL_API_WINDOW_MS) {
    apiHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > GLOBAL_API_MAX;
}

// Prune stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of apiHits) {
    if (now - entry.windowStart > GLOBAL_API_WINDOW_MS * 5) apiHits.delete(ip);
  }
}, 300_000);

export async function proxy(req: NextRequest) {
  // ── Global rate limit on API routes ──
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/webhooks')) {
    const ip = getClientIP(req);
    if (isApiRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }

  const cookie = req.cookies.get('ms_auth')?.value;
  if (cookie) {
    const session = await verify(cookie);
    if (session) {
      const secondsLeft = session.exp - Math.floor(Date.now() / 1000);
      const daysLeft = secondsLeft / ONE_DAY;

      if (daysLeft < 3) {
        const newExp = Math.floor(Date.now() / 1000) + 7 * ONE_DAY;
        const newToken = await signToken({
          cid: session.cid,
          tier: session.tier,
          workspaceId: session.workspaceId,
          exp: newExp,
        });

        const res = NextResponse.next();
        res.cookies.set('ms_auth', newToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 7 * ONE_DAY,
        });
        return res;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
