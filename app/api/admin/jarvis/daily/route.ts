import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { pgReportStore } from '@/lib/jarvis/report/persistDailyReport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/jarvis/daily[?date=YYYY-MM-DD] — latest (or specific) persisted daily report. Owner-only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = req.nextUrl.searchParams.get('date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  try {
    const store = pgReportStore(q);
    const row = date ? await store.getBySession(date) : await store.getLatest();
    if (!row) return NextResponse.json({ error: date ? `No report persisted for ${date}` : 'No reports persisted yet' }, { status: 404 });
    const nav = await store.neighbours(row.sessionDate);
    return NextResponse.json({
      sessionDate: row.sessionDate, runId: row.runId, reportVersion: row.reportVersion, status: row.status, healthStatus: row.healthStatus, headline: row.headline,
      generatedAt: row.generatedAt, updatedAt: row.updatedAt, emailStatus: row.emailStatus, emailSentAt: row.emailSentAt, report: row.reportJson, markdown: row.reportMarkdown, nav,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load report' }, { status: 500 });
  }
}
