/**
 * Admin marketing drafts API.
 *
 * GET   /api/admin/marketing/drafts            list drafts (?status=&channel=&limit=)
 * POST  /api/admin/marketing/drafts            generate a new draft via Arca
 *   body: { channel, topic?, notes?, data? }
 * PATCH /api/admin/marketing/drafts            update one
 *   body: { id, content?, status?, topic? }
 * POST  /api/admin/marketing/drafts/publish    publish one to its channel
 *   body: { id }
 * DELETE /api/admin/marketing/drafts?id=N
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  MARKETING_CHANNELS,
  insertDraft,
  listDrafts,
  updateDraft,
  deleteDraft,
} from '@/lib/arcaMarketing';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = req.nextUrl;
  const status = url.searchParams.get('status') || undefined;
  const channel = url.searchParams.get('channel') || undefined;
  const limit = Number(url.searchParams.get('limit') || '100');
  try {
    const rows = await listDrafts({ status, channel, limit });
    return NextResponse.json({ drafts: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'list failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const channel = String(body?.channel || '').toLowerCase();
  if (!MARKETING_CHANNELS.includes(channel as any)) {
    return NextResponse.json(
      { error: `channel must be one of: ${MARKETING_CHANNELS.join(', ')}` },
      { status: 400 },
    );
  }
  try {
    const draft = await insertDraft({
      channel: channel as any,
      topic: body?.topic ? String(body.topic).slice(0, 200) : undefined,
      notes: body?.notes ? String(body.notes).slice(0, 1000) : undefined,
      data: body?.data,
      source: 'manual',
    });
    return NextResponse.json({ draft });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'draft failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: any = {};
  if (typeof body?.content === 'string') patch.content = body.content.slice(0, 8000);
  if (typeof body?.topic === 'string') patch.topic = body.topic.slice(0, 200);
  if (typeof body?.status === 'string') {
    const s = body.status.toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(s)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    patch.status = s;
  }
  try {
    const row = await updateDraft(id, patch);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ draft: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'update failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const ok = await deleteDraft(id);
    return NextResponse.json({ ok });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'delete failed' }, { status: 500 });
  }
}
