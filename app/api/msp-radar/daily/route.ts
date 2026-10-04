import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { pgReportStore } from '@/lib/jarvis/report/persistDailyReport';
import { checkRadarAccess, RADAR_DENIED_BODY } from '@/lib/mspRadar/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/msp-radar/daily[?date=YYYY-MM-DD] — MSP Radar Daily Market Intelligence for paid customers (admins allowed).
 * Customer payload: report + navigation only. Delivery/email bookkeeping stays on the admin route.
 */
export async function GET(req: NextRequest) {
  const access = await checkRadarAccess(req);
  if (!access.ok) return NextResponse.json(RADAR_DENIED_BODY[access.status], { status: access.status, headers: { 'Cache-Control': 'private, no-store' } });
  const date = req.nextUrl.searchParams.get('date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  try {
    const store = pgReportStore(q);
    const row = date ? await store.getBySession(date) : await store.getLatest();
    if (!row) return NextResponse.json({ error: date ? `No report available for ${date}` : 'No reports available yet' }, { status: 404 });
    const nav = await store.neighbours(row.sessionDate);
    if (req.nextUrl.searchParams.get('view') === 'card') {
      const body = row.reportJson as { candidates?: unknown } | null;
      const all = Array.isArray(body?.candidates) ? body.candidates : [];
      const chips = all.slice(0, 3).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        const symbol = typeof candidate.symbol === 'string' ? candidate.symbol : '';
        if (!symbol) return [];
        return [{ symbol, setupType: typeof candidate.setupType === 'string' ? candidate.setupType : '' }];
      });
      return NextResponse.json({
        sessionDate: row.sessionDate, status: row.status, healthStatus: row.healthStatus, generatedAt: row.generatedAt,
        candidateCount: all.length, report: { candidates: chips },
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({
      sessionDate: row.sessionDate, reportVersion: row.reportVersion, status: row.status, healthStatus: row.healthStatus, headline: row.headline,
      generatedAt: row.generatedAt, report: row.reportJson, nav,
      ...(access.via === 'admin' ? { ops: { runId: row.runId, emailStatus: row.emailStatus, emailSentAt: row.emailSentAt } } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[msp-radar/daily]', e);
    return NextResponse.json({ error: 'Failed to load report' }, { status: 500 });
  }
}
