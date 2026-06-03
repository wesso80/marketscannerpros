import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  consumeOauthState,
  xExchangeCode,
  saveOauthToken,
  xFetchMe,
} from '@/lib/arcaOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(message: string, ok: boolean) {
  const color = ok ? '#10B981' : '#EF4444';
  return `<!doctype html><html><head><meta charset="utf-8"><title>X connect</title>
  <style>body{font-family:system-ui;background:#0F172A;color:#E5E7EB;padding:40px;max-width:600px;margin:auto}
  .card{background:#111827;border:1px solid #1F2937;border-radius:12px;padding:24px}
  h1{color:${color};margin-top:0}
  a{color:#60A5FA}</style></head><body>
  <div class="card"><h1>${ok ? 'X connected' : 'Connect failed'}</h1>
  <p>${message}</p>
  <p><a href="/admin/marketing-queue">← Back to Marketing Queue</a></p>
  </div></body></html>`;
}

export async function GET(req: NextRequest) {
  // The callback hits in a browser — admin auth is the user's existing cookie.
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return new NextResponse(html('Admin auth required. Log in and retry.', false), {
      status: 401,
      headers: { 'content-type': 'text/html' },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return new NextResponse(
      html(`X returned an error: <code>${errParam}</code>`, false),
      { status: 400, headers: { 'content-type': 'text/html' } },
    );
  }
  if (!code || !state) {
    return new NextResponse(html('Missing code or state from X.', false), {
      status: 400,
      headers: { 'content-type': 'text/html' },
    });
  }

  try {
    const stored = await consumeOauthState(state);
    if (!stored || stored.provider !== 'x') {
      return new NextResponse(html('Invalid or expired state. Reconnect.', false), {
        status: 400,
        headers: { 'content-type': 'text/html' },
      });
    }

    const tok = await xExchangeCode({ code, codeVerifier: stored.code_verifier });

    let handle: string | null = null;
    let accountId: string | null = null;
    try {
      const me = await xFetchMe(tok.access_token);
      handle = me.username ? `@${me.username}` : null;
      accountId = me.id || null;
    } catch {
      /* ignore — we still have the token */
    }

    await saveOauthToken({
      provider: 'x',
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token || null,
      expiresInSec: tok.expires_in || 7200,
      scope: tok.scope || null,
      accountId,
      accountHandle: handle,
    });

    return new NextResponse(
      html(
        `X account linked${handle ? ` as <strong>${handle}</strong>` : ''}. You can now publish drafts to X from the Marketing Queue.`,
        true,
      ),
      { headers: { 'content-type': 'text/html' } },
    );
  } catch (err: any) {
    return new NextResponse(
      html(`Token exchange failed: <code>${(err?.message || 'unknown').slice(0, 300)}</code>`, false),
      { status: 500, headers: { 'content-type': 'text/html' } },
    );
  }
}
