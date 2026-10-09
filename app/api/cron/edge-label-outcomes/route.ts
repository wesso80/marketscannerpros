/**
 * POST /api/cron/edge-label-outcomes
 *
 * Nightly job (or every few hours) that labels MFE/MAE/realised R for
 * pending and partial edge_ledger_setups using forward OHLCV bars.
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { labelAllPending } from '@/lib/edge/outcomeLabeller';
import { notifyAdmin } from '@/lib/admin/notifyAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function authorise(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  const cronOk = !!cronSecret && timingSafeCompare(headerCron, cronSecret);
  const adminHeaderOk = !!adminSecret && timingSafeCompare(headerAuth, adminSecret);
  if (cronOk || adminHeaderOk) return true;
  const session = await requireAdmin(req);
  return session.ok;
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit')) || 500;
  const started = Date.now();
  try {
    const result = await labelAllPending({ limit });
    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - started,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: 'edge-label-outcomes failed',
      body: `Outcome labeller failed: ${message}`,
      severity: 'error',
      context: { limit, durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
