import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { deletePost, getPost, updatePostStatus } from '@/lib/growth/db';
import type { PostStatus } from '@/lib/growth/types';

const VALID_STATUSES: PostStatus[] = ['draft', 'review', 'approved', 'posted', 'rejected'];

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const workspaceId = 'admin';
  const post = await getPost(workspaceId, id);
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const workspaceId = 'admin';
  const status = body?.status;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join('|')}` },
      { status: 400 },
    );
  }

  // Guard: don't allow direct transition to 'posted' via PATCH — that path
  // must go through /publish, which performs the platform call.
  if (status === 'posted') {
    return NextResponse.json(
      { error: 'use POST /publish to mark a post as posted (it performs the platform call)' },
      { status: 400 },
    );
  }

  const current = await getPost(workspaceId, id);
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (status === 'approved' && current.compliance_score < 85) {
    return NextResponse.json(
      {
        error: `compliance_score (${current.compliance_score}) is below the 85 minimum. Edit the post or regenerate before approving.`,
      },
      { status: 422 },
    );
  }

  const updated = await updatePostStatus({
    workspaceId,
    id,
    status: status ?? current.status,
    approvedBy: status === 'approved' ? auth.cid ?? 'admin' : undefined,
    rejectedReason: status === 'rejected' ? body?.rejectedReason ?? null : undefined,
    scheduledFor: typeof body?.scheduledFor === 'string' ? body.scheduledFor : undefined,
  });

  return NextResponse.json({ post: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const workspaceId = 'admin';
  const ok = await deletePost(workspaceId, id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
