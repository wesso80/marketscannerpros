import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { pgReportStore } from '@/lib/jarvis/report/persistDailyReport';
import { checkRadarAccess, RADAR_DENIED_BODY } from '@/lib/mspRadar/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/msp-radar/archive?limit=30 — report metadata list for paid customers (admins allowed). */
export async function GET(req: NextRequest) {
  const access = await checkRadarAccess(req);
  if (!access.ok) return NextResponse.json(RADAR_DENIED_BODY[access.status], { status: access.status, headers: { 'Cache-Control': 'private, no-store' } });
  const limit = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 30) || 30));
  try {
    const rows = await pgReportStore(q).listArchive(limit);
    const items = access.via === 'admin' ? rows : rows.map(({ emailStatus: _email, ...rest }) => rest);
    return NextResponse.json({ items, limit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[msp-radar/archive]', e);
    return NextResponse.json({ error: 'Failed to load archive' }, { status: 500 });
  }
}
