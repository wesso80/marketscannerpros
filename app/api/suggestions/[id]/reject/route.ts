/**
 * POST /api/suggestions/[id]/reject — Reject a trade suggestion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const suggestionId = parseInt(id, 10);
  if (!Number.isFinite(suggestionId)) {
    return NextResponse.json({ error: 'Invalid suggestion ID' }, { status: 400 });
  }

  const rows = await q(
    `UPDATE trade_suggestions SET status = 'rejected', acted_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
     RETURNING id`,
    [suggestionId, session.workspaceId]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Suggestion not found or already acted on' }, { status: 404 });
  }

  return NextResponse.json({ success: true, suggestionId });
}
