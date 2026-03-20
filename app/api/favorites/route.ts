import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';

/* ─── GET /api/favorites — list user's favorite pages ─── */
export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await q(
    'SELECT page_key, display_order FROM user_favorites WHERE workspace_id = $1 ORDER BY display_order ASC, added_at ASC',
    [session.workspaceId]
  );

  return NextResponse.json({ favorites: rows.map(r => r.page_key) });
}

/* ─── POST /api/favorites — add a page to favorites ─── */
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const pageKey = typeof body.pageKey === 'string' ? body.pageKey.trim().slice(0, 60) : '';
  if (!pageKey) {
    return NextResponse.json({ error: 'pageKey is required' }, { status: 400 });
  }

  // Get next display order
  const maxRows = await q<{ mx: number }>(
    'SELECT COALESCE(MAX(display_order), -1) AS mx FROM user_favorites WHERE workspace_id = $1',
    [session.workspaceId]
  );
  const nextOrder = (maxRows[0]?.mx ?? -1) + 1;

  await q(
    `INSERT INTO user_favorites (workspace_id, page_key, display_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, page_key) DO NOTHING`,
    [session.workspaceId, pageKey, nextOrder]
  );

  return NextResponse.json({ ok: true });
}

/* ─── DELETE /api/favorites — remove a page from favorites ─── */
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const pageKey = typeof body.pageKey === 'string' ? body.pageKey.trim() : '';
  if (!pageKey) {
    return NextResponse.json({ error: 'pageKey is required' }, { status: 400 });
  }

  await q(
    'DELETE FROM user_favorites WHERE workspace_id = $1 AND page_key = $2',
    [session.workspaceId, pageKey]
  );

  return NextResponse.json({ ok: true });
}

/* ─── PUT /api/favorites — reorder favorites ─── */
export async function PUT(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const order = Array.isArray(body.order) ? body.order : [];
  if (!order.length || !order.every((k: unknown) => typeof k === 'string')) {
    return NextResponse.json({ error: 'order must be a string array of page keys' }, { status: 400 });
  }

  // Update display_order for each page key
  for (let i = 0; i < order.length; i++) {
    await q(
      'UPDATE user_favorites SET display_order = $1 WHERE workspace_id = $2 AND page_key = $3',
      [i, session.workspaceId, order[i]]
    );
  }

  return NextResponse.json({ ok: true });
}
