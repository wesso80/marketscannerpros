// app/middleware.ts (or ./middleware.ts)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_SIGNING_SECRET = process.env.APP_SIGNING_SECRET!;
const ONE_DAY = 60 * 60 * 24;

// --- HMAC (Edge-compatible, Web Crypto API) ---
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
  // URL-safe base64 (no padding)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signToken(payload: object) {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
    cid: string; tier: string; workspaceId: string; exp: number
  };

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ----------------- Middleware -----------------
export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase();

  // Refresh signed session cookie if it will expire in < 3 days
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

// Match everything so we can handle host & cookies
export const config = {
  matcher: '/:path*',
};
