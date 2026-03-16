import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeEdgeProfile, type EdgeDimension } from '@/lib/intelligence/edgeProfile';

/**
 * GET /api/intelligence/edge-profile
 *
 * Returns the trader's full edge profile computed from trade_outcomes.
 * Query params:
 *   ?lookback=90        — only consider last N days (optional)
 *   ?dimensions=side,regime  — comma-separated subset (optional)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const lookbackParam = url.searchParams.get('lookback');
  const dimsParam = url.searchParams.get('dimensions');

  const lookbackDays = lookbackParam ? parseInt(lookbackParam, 10) : null;
  const dimensions = dimsParam
    ? dimsParam.split(',').map(d => d.trim()) as EdgeDimension[]
    : undefined;

  try {
    const profile = await computeEdgeProfile(session.workspaceId, {
      lookbackDays: Number.isFinite(lookbackDays) ? lookbackDays : null,
      dimensions,
    });

    return NextResponse.json(profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // trade_outcomes table might not exist yet — return empty profile gracefully
    if (message.includes('relation "trade_outcomes" does not exist')) {
      return NextResponse.json({
        workspaceId: session.workspaceId,
        totalOutcomes: 0,
        computedAt: new Date().toISOString(),
        slices: [],
        topEdges: [],
        weakSpots: [],
        insights: [],
        _note: 'trade_outcomes table not yet created — run migration 051',
      });
    }
    console.error('[edge-profile] Error:', message);
    return NextResponse.json({ error: 'Failed to compute edge profile' }, { status: 500 });
  }
}
