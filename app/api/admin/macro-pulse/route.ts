/**
 * GET /api/admin/macro-pulse
 * Returns a snapshot of all macro_series with latest value, prev value,
 * change, change%, and freshness age in days.
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readMacroSnapshot } from '@/lib/macro/fred';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const snapshot = await readMacroSnapshot();
    return NextResponse.json({ ok: true, snapshot, generatedAt: new Date().toISOString() });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
