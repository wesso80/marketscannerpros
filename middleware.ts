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

export async function middleware(req: NextRequest) {
  // ── Global rate limit on API routes ──
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/webhooks') && !pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/internal/')) {
    const ip = getClientIP(req);
    if (isApiRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }

  // Admin emails from ADMIN_EMAILS env var (comma-separated)
  const adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  const ADMIN_EMAILS_MW = adminEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const ADMIN_PREFIXES = ['admin_', 'free_', 'trial_'];
  const ADMIN_CIDS = ADMIN_EMAILS_MW.flatMap(email => ADMIN_PREFIXES.map(p => `${p}${email}`));

  const cookie = req.cookies.get('ms_auth')?.value;
  if (cookie) {
    const session = await verify(cookie);
    if (session) {
      const cid = session.cid || '';
      const isAdmin = ADMIN_CIDS.includes(cid) || ADMIN_EMAILS_MW.includes(cid.toLowerCase());
      const secondsLeft = session.exp - Math.floor(Date.now() / 1000);
      const daysLeft = secondsLeft / ONE_DAY;
      const refreshThreshold = isAdmin ? 30 : 7;
      const refreshDays = isAdmin ? 365 : 30;
      let refreshTier = isAdmin ? 'pro_trader' : session.tier;

      if (daysLeft < refreshThreshold) {
        // Verify current tier from database before refreshing (skip for admin/anon)
        if (!isAdmin && !session.cid.startsWith('anon-')) {
          try {
            const origin = req.nextUrl.origin;
            const verifyUrl = `${origin}/api/internal/verify-tier?wid=${encodeURIComponent(session.workspaceId)}`;
            const resp = await fetch(verifyUrl, {
              headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
            });
            if (resp.ok) {
              const data = await resp.json() as { tier: string; status: string };
              if (data.tier !== 'unknown') {
                refreshTier = data.tier;
              }
            }
          } catch {
            // DB check failed — fall back to cookie tier (graceful degradation)
          }
        }

        const newExp = Math.floor(Date.now() / 1000) + refreshDays * ONE_DAY;
        const newToken = await signToken({
          cid: session.cid,
          tier: refreshTier,
          workspaceId: session.workspaceId,
          exp: newExp,
        });

        const host = req.headers.get('host') || '';
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

        const res = NextResponse.next();
        res.cookies.set('ms_auth', newToken, isLocalhost
          ? { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/', maxAge: refreshDays * ONE_DAY }
          : { httpOnly: true, secure: true, sameSite: 'lax' as const, domain: '.marketscannerpros.app', path: '/', maxAge: refreshDays * ONE_DAY }
        );
        return res;
      }
    }
  }

  // ── FFA anonymous workspace isolation ──
  // When FREE_FOR_ALL_MODE is on and user has no session, assign a persistent
  // anonymous ID so each browser gets its own workspace (no shared data).
  if (process.env.FREE_FOR_ALL_MODE === 'true' && !cookie) {
    const existing = req.cookies.get('ms_anon')?.value;
    if (!existing) {
      const anonId = crypto.randomUUID();
      const host = req.headers.get('host') || '';
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
      const res = NextResponse.next();
      res.cookies.set('ms_anon', anonId, isLocalhost
        ? { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/', maxAge: 30 * ONE_DAY }
        : { httpOnly: true, secure: true, sameSite: 'lax' as const, domain: '.marketscannerpros.app', path: '/', maxAge: 30 * ONE_DAY }
      );
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
