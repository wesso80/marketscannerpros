/**
 * GET /api/admin/edge-ledger
 *
 * Returns the edge matrix + recent setups for the authed admin's
 * workspace. Used by /admin/edge-ledger page.
 *
 * Query:
 *   ?dimension=playbook|regime|sector|iv_bucket|catalyst_proximity
 *   ?status=surfaced|taken|skipped|invalidated
 *   ?limit=200
 *   ?days=30   (how far back to read recent setups)
 *
 * Auth: admin session via requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readMatrix } from '@/lib/edge/matrix';
import { readRecentSetups } from '@/lib/edge/ledger';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Dimension = 'playbook' | 'regime' | 'sector' | 'iv_bucket' | 'catalyst_proximity';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const workspaceId = session.workspaceId;
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'No workspace' }, { status: 400 });
  }

  const url = new URL(req.url);
  const dimensionParam = url.searchParams.get('dimension');
  const dimension = dimensionParam &&
    ['playbook', 'regime', 'sector', 'iv_bucket', 'catalyst_proximity'].includes(dimensionParam)
      ? (dimensionParam as Dimension)
      : undefined;
  const statusParam = url.searchParams.get('status');
  const status = statusParam &&
    ['surfaced', 'taken', 'skipped', 'invalidated'].includes(statusParam)
      ? (statusParam as 'surfaced' | 'taken' | 'skipped' | 'invalidated')
      : undefined;
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));

  const sinceISO = new Date(Date.now() - days * 86400_000).toISOString();

  const [matrix, recentSetups, summary] = await Promise.all([
    readMatrix({ workspaceId, dimension }),
    readRecentSetups({ workspaceId, status, sinceISO, limit }),
    q<{ total: string; taken: string; skipped: string; pending_outcomes: string; complete_outcomes: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE s.status = 'taken')::text AS taken,
         COUNT(*) FILTER (WHERE s.status = 'skipped')::text AS skipped,
         COUNT(*) FILTER (WHERE o.outcome_status IS NULL OR o.outcome_status = 'pending')::text AS pending_outcomes,
         COUNT(*) FILTER (WHERE o.outcome_status = 'complete')::text AS complete_outcomes
       FROM edge_ledger_setups s
       LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
       WHERE s.workspace_id = $1 AND s.surfaced_at >= $2`,
      [workspaceId, sinceISO],
    ),
  ]);

  const s = summary[0] ?? { total: '0', taken: '0', skipped: '0', pending_outcomes: '0', complete_outcomes: '0' };
  return NextResponse.json({
    ok: true,
    summary: {
      total: Number(s.total),
      taken: Number(s.taken),
      skipped: Number(s.skipped),
      pendingOutcomes: Number(s.pending_outcomes),
      completeOutcomes: Number(s.complete_outcomes),
      days,
    },
    matrix,
    recentSetups,
    generatedAt: new Date().toISOString(),
  });
}
