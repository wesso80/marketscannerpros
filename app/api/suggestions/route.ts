/**
 * GET /api/suggestions — List pending trade suggestions for the current user.
 *
 * Query params:
 *   status  — filter by status (default: 'pending')
 *   limit   — max results (default: 20, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);

  // Validate status param
  const validStatuses = ['pending', 'accepted', 'rejected', 'expired'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const suggestions = await q(
    `SELECT id, symbol, asset_class, direction, strategy, setup,
            scanner_score, edge_match_score, confidence_score,
            suggested_entry, suggested_stop, suggested_target,
            position_size, risk_reward, reasoning, status,
            created_at, expires_at, acted_at
     FROM trade_suggestions
     WHERE workspace_id = $1 AND status = $2
     ORDER BY confidence_score DESC, scanner_score DESC
     LIMIT $3`,
    [session.workspaceId, status, limit]
  );

  return NextResponse.json({ suggestions });
}
