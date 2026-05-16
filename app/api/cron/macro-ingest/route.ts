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
    return NextResponse.json({ ...result, durationMs: Date.now() - started });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
