import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/quant/operatorAuth';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

/**
 * Operator-only API routes sit outside the /api/admin middleware gate, so each one checks here after its sign-in
 * check. A signed-in session that is neither admin nor operator gets 403 before any read, write or action runs.
 * Returns null when the session may proceed.
 */
export function operatorAccessDenied(session: { cid?: string | null; workspaceId?: string | null; is_admin?: boolean } | null): NextResponse | null {
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const allowed = session.is_admin === true || (session.cid ? isOperator(session.cid, session.workspaceId) : false);
  return allowed ? null : NextResponse.json({ error: 'Operator access required' }, { status: 403, headers });
}
