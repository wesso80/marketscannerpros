import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Clears the httpOnly ms_auth cookie server-side then redirects to home.
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  const res = NextResponse.json({ ok: true });

  // Clear with domain (production)
  res.cookies.set('ms_auth', '', {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: isLocalhost ? 'lax' : 'none',
    domain: isLocalhost ? undefined : '.marketscannerpros.app',
    path: '/',
    maxAge: 0,
  });

  // Also clear without domain (covers localhost & any edge cases)
  res.cookies.set('ms_auth', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return res;
}
