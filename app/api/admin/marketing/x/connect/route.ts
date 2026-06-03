import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  ensureOauthSchema,
  makeCodeVerifier,
  codeChallengeFor,
  makeRandomState,
  saveOauthState,
  xAuthorizeUrl,
  xConfig,
} from '@/lib/arcaOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { redirectUri } = xConfig();
    await ensureOauthSchema();

    const verifier = makeCodeVerifier();
    const challenge = codeChallengeFor(verifier);
    const state = makeRandomState();

    await saveOauthState({ state, provider: 'x', codeVerifier: verifier, redirectUri });

    const url = xAuthorizeUrl(state, challenge);
    return NextResponse.redirect(url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'X connect failed' },
      { status: 500 },
    );
  }
}
