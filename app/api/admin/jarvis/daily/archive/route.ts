import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { pgReportStore } from '@/lib/jarvis/report/persistDailyReport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/jarvis/daily/archive?limit=30 — report metadata list (no payloads). Owner-only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 30) || 30));
  try {
    const items = await pgReportStore(q).listArchive(limit);
    return NextResponse.json({ items, limit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load archive' }, { status: 500 });
  }
}
