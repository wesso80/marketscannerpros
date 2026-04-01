/**
 * GET /api/operator/engine/radar — Get current radar opportunities
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    // TODO: Pull from cached scan results or run lightweight scan
    // For now return empty radar
    return NextResponse.json({
      ok: true,
      radar: [],
      lastScanAt: null,
      note: 'Radar endpoint ready. Run POST /api/operator/engine/scan to populate.',
    });
  } catch (err: unknown) {
    console.error('[operator:engine:radar] Error:', err);
    return NextResponse.json(
      { error: 'Radar fetch failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
