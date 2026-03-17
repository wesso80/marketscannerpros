import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeEdgeProfile, isValidDimension } from '@/lib/intelligence/edgeProfile';
import type { EdgeProfile } from '@/lib/intelligence/edgeProfile';

/**
 * GET /api/intelligence/edge-profile
 *
 * Returns the trader's full edge profile computed from trade_outcomes.
 * v3.2: Now includes edgeSummary, strongestEdges, weakestEdges, softEdgeHints.
 *
 * Query params:
 *   ?lookback=90        — only consider last N days (optional)
 *   ?dimensions=side,regime  — comma-separated subset (optional)
 */

/* ── In-memory cache (per-workspace, 60s TTL) ─────────────────────────── */
const profileCache = new Map<string, { data: EdgeProfile; ts: number }>();
const CACHE_TTL_MS = 60_000;

function getCachedProfile(key: string): EdgeProfile | null {
  const entry = profileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    profileCache.delete(key);
    return null;
  }
  return entry.data;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Entitlement gate: full edge profile is Pro / Pro Trader only
  const tier = session.tier ?? 'free';
  if (tier !== 'pro' && tier !== 'pro_trader') {
    return NextResponse.json({
      error: 'Edge Profile requires a Pro or Pro Trader subscription',
      requiredTier: 'pro',
    }, { status: 403 });
  }

  const url = new URL(req.url);
  const lookbackParam = url.searchParams.get('lookback');
  const dimsParam = url.searchParams.get('dimensions');

  const lookbackDays = lookbackParam ? parseInt(lookbackParam, 10) : null;
  const dimensions = dimsParam
    ? dimsParam.split(',').map(d => d.trim()).filter(isValidDimension)
    : undefined;

  if (dimsParam && (!dimensions || dimensions.length === 0)) {
    return NextResponse.json({ error: 'Invalid dimensions parameter' }, { status: 400 });
  }

  const cacheKey = `${session.workspaceId}:${lookbackDays ?? 'all'}:${dimensions?.join(',') ?? 'default'}`;

  try {
    let profile = getCachedProfile(cacheKey);
    if (!profile) {
      profile = await computeEdgeProfile(session.workspaceId, {
        lookbackDays: Number.isFinite(lookbackDays) ? lookbackDays : null,
        dimensions,
      });
      profileCache.set(cacheKey, { data: profile, ts: Date.now() });
    }

    return NextResponse.json(profile, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
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
        edgeSummary: null,
        strongestEdges: [],
        weakestEdges: [],
        softEdgeHints: { preferredAssets: [], preferredSides: [], preferredStrategies: [], preferredRegimes: [], hasEnoughData: false },
        _note: 'trade_outcomes table not yet created — run migration 051',
      });
    }
    console.error('[edge-profile] Error:', message);
    return NextResponse.json({ error: 'Failed to compute edge profile' }, { status: 500 });
  }
}
