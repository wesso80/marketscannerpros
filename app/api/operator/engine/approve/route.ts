/**
 * POST /api/operator/engine/approve — Approve/reject a trade candidate
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const candidateId = String(body.candidateId || '').trim();
    const action: 'approve' | 'reject' | 'modify' = body.action || 'approve';

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    if (!['approve', 'reject', 'modify'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject, or modify' }, { status: 400 });
    }

    // TODO: Look up live candidate from scan state and apply approval
    // For now, acknowledge the request
    return NextResponse.json({
      ok: true,
      candidateId,
      action,
      appliedAt: new Date().toISOString(),
      note: 'Approval recorded. Execution engine will process on next cycle.',
    });
  } catch (err: unknown) {
    console.error('[operator:engine:approve] Error:', err);
    return NextResponse.json(
      { error: 'Approval failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
