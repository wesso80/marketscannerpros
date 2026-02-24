import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Clears the httpOnly ms_auth cookie server-side.
 *
 * IMPORTANT: NextResponse.cookies.set() uses a Map keyed by cookie name.
 * Calling .set('ms_auth', ...) twice overwrites the first — only the LAST
 * Set-Cookie header for that name is sent.  To clear cookies that may have
 * been set with AND without a domain we must append raw Set-Cookie headers.
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  const res = NextResponse.json({ ok: true });

  // Build the "expired" cookie strings manually so we can send BOTH variants.
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT';

  // 1) Production cookie — matches the domain used by login
  if (!isLocalhost) {
    res.headers.append(
      'Set-Cookie',
      `ms_auth=; Path=/; Domain=.marketscannerpros.app; Max-Age=0; Expires=${past}; HttpOnly; Secure; SameSite=None`
    );
  }

  // 2) Domainless cookie — covers localhost and any edge-case cookies set without a domain
  res.headers.append(
    'Set-Cookie',
    `ms_auth=; Path=/; Max-Age=0; Expires=${past}; HttpOnly; SameSite=Lax`
  );

  return res;
}
