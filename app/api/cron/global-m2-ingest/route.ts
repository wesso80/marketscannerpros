/**
 * POST /api/cron/global-m2-ingest
 *
 * Runs the live Global M2 pipeline and persists every successfully-normalized
 * bloc into macro_series (source-of-truth), so page-loads can serve persisted
 * last-known-good during central-bank outages. Run from a network environment
 * that can reach the central banks (PBOC/RBA are geo/IP-restricted).
 *
 * Auth: x-cron-secret, Bearer ADMIN_SECRET, or admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { ingestGlobalM2 } from '@/lib/intelligence/data/globalM2Pipeline';

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
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') {
    return NextResponse.json({ ok: false, error: 'INTELLIGENCE_LIVE_DATA not enabled' }, { status: 409 });
  }
  const started = Date.now();
  try {
    const summary = await ingestGlobalM2();
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
