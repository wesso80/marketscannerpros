import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeCorrelationRegime } from '@/lib/correlation-regime-engine';
import { loadCrossAssetInputs } from '@/lib/crossAsset/liveInputs';

export const dynamic = 'force-dynamic';

const TTL_MS = 5 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 60 * 1000;
let cache: { at: number; ttl: number; body: Record<string, unknown> } | null = null;

/**
 * GET /api/correlation-regime
 * Cross-asset correlation regime computed from LIVE inputs loaded server-side (lib/crossAsset/liveInputs): BTC and SPY
 * moves are required; VIX, USD index, gold, sectors and the BTC↔SPY correlation are used when available and otherwise
 * reported as unavailable (never defaulted). Cached 5 minutes per instance. Query parameters are no longer accepted
 * (they used to fall back to fixed placeholders that always read "RISK ON 55/100").
 */
export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (cache && Date.now() - cache.at < cache.ttl) return NextResponse.json(cache.body);

  let body: Record<string, unknown>;
  try {
    const { input, inputs, missingRequired } = await loadCrossAssetInputs();
    body = input
      ? { available: true, ...computeCorrelationRegime(input), inputs, computedAt: new Date().toISOString() }
      : { available: false, reason: `Cross-asset regime unavailable: ${missingRequired.join(' and ')} ${missingRequired.length > 1 ? 'are' : 'is'} unavailable or stale.`, inputs, computedAt: new Date().toISOString() };
  } catch (e) {
    body = { available: false, reason: `Cross-asset regime unavailable: ${e instanceof Error ? e.message : 'input load failed'}`, inputs: null, computedAt: new Date().toISOString() };
  }
  cache = { at: Date.now(), ttl: body.available ? TTL_MS : UNAVAILABLE_TTL_MS, body };
  return NextResponse.json(body);
}
