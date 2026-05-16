/**
 * GET /api/admin/calibration
 *
 * Returns the calibration report: realised win-rate / avg R per
 * confidence + opportunity-score + evidence-quality bucket.
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildCalibrationReport } from '@/lib/calibration/calibration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const workspaceId = session.workspaceId;
  if (!workspaceId) return NextResponse.json({ ok: false, error: 'No workspace' }, { status: 400 });
  try {
    const report = await buildCalibrationReport(workspaceId);
    return NextResponse.json({ ok: true, report });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
