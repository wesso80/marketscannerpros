/**
 * POST /api/cron/edge-rebuild-matrix
 *
 * Rebuilds edge_matrix_cells for every workspace that has any
 * edge_ledger_setups rows. Run nightly after the outcome labeller.
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { rebuildMatrixForWorkspace } from '@/lib/edge/matrix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function authorise(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  const cronOk = !!cronSecret && timingSafeCompare(headerCron, cronSecret);
  const adminHeaderOk = !!adminSecret && timingSafeCompare(headerAuth, adminSecret);
  if (cronOk || adminHeaderOk) return true;
  const session = await requireAdmin(req);
  return session.ok;
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  try {
    const workspaces = await q<{ workspace_id: string }>(
      `SELECT DISTINCT workspace_id FROM edge_ledger_setups`,
    );
    const results: Array<{ workspaceId: string; dimensions: number; cells: number }> = [];
    for (const w of workspaces) {
      const dims = await rebuildMatrixForWorkspace(w.workspace_id);
      const cells = dims.reduce((acc, d) => acc + d.cells, 0);
      results.push({ workspaceId: w.workspace_id, dimensions: dims.length, cells });
    }
    return NextResponse.json({
      ok: true,
      workspaces: workspaces.length,
      results,
      durationMs: Date.now() - started,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
