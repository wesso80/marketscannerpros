import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getOauthToken, deleteOauthToken } from '@/lib/arcaOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const tok = await getOauthToken('x');
  const envOk = !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_REDIRECT_URI);

  return NextResponse.json({
    connected: !!tok,
    envOk,
    handle: tok?.account_handle || null,
    accountId: tok?.account_id || null,
    expiresAt: tok?.expires_at || null,
    scope: tok?.scope || null,
    updatedAt: tok?.updated_at || null,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await deleteOauthToken('x');
  return NextResponse.json({ ok: true });
}
