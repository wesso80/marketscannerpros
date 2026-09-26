/**
 * POST /api/cron/macro-ingest
 *
 * Pulls latest observations from FRED into macro_series.
 * Auth: x-cron-secret, Bearer ADMIN_SECRET, or admin session.
 *
 * Query: ?since=YYYY-MM-DD&only=VIX,US10Y
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { ingestFred } from '@/lib/macro/fred';
import { notifyAdmin } from '@/lib/admin/notifyAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a), bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch { return false; }
}

async function authorise(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  if (cronSecret && timingSafeCompare(headerCron, cronSecret)) return true;
  if (adminSecret && timingSafeCompare(headerAuth, adminSecret)) return true;
  return (await requireAdmin(req)).ok;
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const since = url.searchParams.get('since') || undefined;
  const onlyParam = url.searchParams.get('only');
  const only = onlyParam ? onlyParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const started = Date.now();
  try {
    const result = await ingestFred({ sinceISO: since, only });
    const requiredFailed = result.requiredFailed ?? [];
    const apiFallbacks = result.apiFallbacks ?? [];
    // Series errors used to come back as HTTP 200 with ok:false, which `curl -f` in the
    // Render cron treats as success, so a broken ingest went unnoticed (OV-1). Tell the
    // admin about any failed series, and fail the request when nothing was ingested or
    // when a series the market regime needs (VIX, HY OAS) could not be fetched.
    if (result.failed > 0) {
      const failedSeries = result.perSeries.filter((s) => s.error).map((s) => `${s.seriesKey}: ${s.error}`);
      console.error(`[macro-ingest] ${result.failed} series failed (ingested ${result.ingested} rows): ${failedSeries.join(' | ')}`);
      notifyAdmin({
        subject: requiredFailed.length > 0 ? `macro-ingest: regime series failed (${requiredFailed.join(', ')})` : 'macro-ingest: some FRED series failed',
        body: `FRED ingest (${result.via ?? 'api'}) failed for ${result.failed} series:\n${failedSeries.join('\n')}`,
        severity: result.ingested === 0 || requiredFailed.length > 0 ? 'error' : 'warn',
        context: { since: since ?? null, only: only ? only.join(',') : null, ingested: result.ingested, requiredFailed: requiredFailed.join(',') || null, durationMs: Date.now() - started },
      }).catch(() => {});
    }
    // The FRED API failing while the CSV worked usually means FRED_API_KEY on the web service is wrong or revoked.
    if (apiFallbacks.length > 0) {
      notifyAdmin({
        subject: 'macro-ingest: FRED API failed, used keyless CSV',
        body: `The FRED API failed for ${apiFallbacks.length} series, so the keyless CSV was used. Check FRED_API_KEY on the web service.\nFirst error: ${apiFallbacks[0].seriesKey}: ${apiFallbacks[0].apiError}`,
        severity: 'warn',
        context: { series: apiFallbacks.map((f) => f.seriesKey).join(','), durationMs: Date.now() - started },
      }).catch(() => {});
    }
    const status = result.failed > 0 && (result.ingested === 0 || requiredFailed.length > 0) ? 502 : 200;
    return NextResponse.json({ ...result, durationMs: Date.now() - started }, { status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[macro-ingest] failed: ${msg}`);
    notifyAdmin({
      subject: 'macro-ingest failed',
      body: `FRED ingest failed: ${msg}`,
      severity: 'error',
      context: { since: since ?? null, only: only ? only.join(',') : null, durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
