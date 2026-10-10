import { NextRequest, NextResponse } from 'next/server';
import { avCircuit, coinGeckoCircuit, openAICircuit } from '@/lib/circuitBreaker';
import { requireAdmin } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';
import { readDataFreshness } from '@/lib/health/dataFreshness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
};

/**
 * GET /api/health/data
 * Admin freshness probe. Reports cache age and provider circuit snapshots.
 *
 * Signed-out callers get 401. Signed-in non-admins get 403. Both bodies are
 * `{ error: 'Unauthorized' }` and are returned before any cache read.
 *
 * The public banner uses GET /api/health/stale, which returns only `{ stale }`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req).catch(() => null);
  if (!auth?.ok) {
    const session = await getSessionFromCookie().catch(() => null);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: session ? 403 : 401, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const report = await readDataFreshness();

    return NextResponse.json({
      ok: true,
      stale: report.stale,
      populatedCount: report.populatedCount,
      checkedCount: report.checkedCount,
      source: report.stale ? 'Market data cache' : undefined,
      checkedAt: new Date().toISOString(),
      details: report.staleSources.length > 0 ? report.staleSources : undefined,
      circuits: {
        alphaVantage: avCircuit.getSnapshot(),
        coinGecko: coinGeckoCircuit.getSnapshot(),
        openAI: openAICircuit.getSnapshot(),
      },
    }, { headers: PRIVATE_HEADERS });
  } catch (err) {
    console.error('[health/data] Error:', err);
    // On error, don't assume stale — avoid false-positive banner
    return NextResponse.json({ ok: false, stale: false }, { headers: PRIVATE_HEADERS });
  }
}
