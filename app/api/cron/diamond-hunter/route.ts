import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDiamondHunterScan } from '@/lib/diamondHunterScanner';
import { updateDiamondHunterOutcomes } from '@/lib/diamondHunterOutcomeTracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  try {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function authorised(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const cronHeader = req.headers.get('x-cron-secret') || '';
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return (!!cronSecret && safeEqual(cronHeader, cronSecret))
    || (!!adminSecret && safeEqual(bearer, adminSecret));
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const scan = await runDiamondHunterScan({ forceRefresh: true });
    const outcomes = await updateDiamondHunterOutcomes(6);
    return NextResponse.json({
      ok: true,
      poolsScanned: scan.stats.poolsScanned,
      candidatesShown: scan.stats.candidatesShown,
      provisionalDiamonds: scan.stats.provisionalDiamonds,
      confirmedDiamonds: scan.stats.confirmedDiamonds,
      historyPersisted: scan.stats.historyPersisted,
      outcomes,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DiamondHunterCron] failed:', error);
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - started }, { status: 500 });
  }
}
