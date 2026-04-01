/**
 * POST /api/operator/engine/kill-switch — Toggle kill switch
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  let workspaceId: string | undefined;

  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    workspaceId = session.workspaceId;
  }

  try {
    const body = await req.json();
    const active = Boolean(body.active);
    const reason = String(body.reason || 'Manual toggle').slice(0, 200);

    // Store kill-switch state in operator_state
    if (workspaceId) {
      await q(
        `INSERT INTO operator_state (workspace_id, context_state, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (workspace_id) DO UPDATE
         SET context_state = operator_state.context_state || $2,
             updated_at = NOW()`,
        [workspaceId, JSON.stringify({ killSwitch: { active, reason, toggledAt: new Date().toISOString() } })],
      );
    }

    return NextResponse.json({
      ok: true,
      killSwitch: { active, reason, toggledAt: new Date().toISOString() },
    });
  } catch (err: unknown) {
    console.error('[operator:engine:kill-switch] Error:', err);
    return NextResponse.json(
      { error: 'Kill switch toggle failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
