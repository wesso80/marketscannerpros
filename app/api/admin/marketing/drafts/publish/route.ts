/**
 * Publish an approved draft to its channel.
 * POST /api/admin/marketing/drafts/publish  body: { id }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { publishDraft } from '@/lib/arcaMarketing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const draft = await publishDraft(id);
    if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'publish failed' }, { status: 500 });
  }
}
