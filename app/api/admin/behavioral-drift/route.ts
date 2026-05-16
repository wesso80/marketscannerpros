/**
 * GET /api/admin/behavioral-drift?days=30
 *
 * Returns the behavioral-drift signals report. Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildDriftReport } from '@/lib/behavioral/drift';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const workspaceId = session.workspaceId;
  if (!workspaceId) return NextResponse.json({ ok: false, error: 'No workspace' }, { status: 400 });
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 30));
  try {
    const report = await buildDriftReport(workspaceId, days);
    return NextResponse.json({ ok: true, report });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
