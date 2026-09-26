/**
 * GET /api/operator/engine/radar — Get current radar opportunities
 * Reads the persisted radar from the shared saved admin scan (admin_scan_results), all markets,
 * instead of process memory (which was empty after every restart and differed per instance).
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import type { RadarOpportunity } from '@/types/operator';
import { readSavedScan, savedScanStaleAfterSec } from '@/lib/admin/sharedScan';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    const timeframe = req.nextUrl.searchParams.get('timeframe') || '15m';
    const staleAfter = savedScanStaleAfterSec();
    const views = await Promise.all([
      readSavedScan({ market: 'EQUITIES', timeframe }),
      readSavedScan({ market: 'CRYPTO', timeframe }),
    ]);
    const radar: RadarOpportunity[] = views
      .flatMap((v) => v.rows)
      .filter((r) => r.status === 'ok' && r.ageSec != null && r.ageSec <= staleAfter)
      .flatMap((r) => r.radar)
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
    const lastScanAt = views.map((v) => v.newestScannedAt).filter((t): t is string => !!t).sort().pop() ?? null;
    return NextResponse.json({
      ok: true,
      radar,
      lastScanAt,
      count: radar.length,
      savedScan: views.map((v) => ({ market: v.market, available: v.available, message: v.message ?? null, ageLabel: v.ageLabel })),
    });
  } catch (err: unknown) {
    console.error('[operator:engine:radar] Error:', err);
    return NextResponse.json(
      { error: 'Radar fetch failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
