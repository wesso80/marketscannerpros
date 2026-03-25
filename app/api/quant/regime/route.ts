/**
 * GET /api/quant/regime — Current unified regime state
 *
 * PRIVATE — requires admin authentication.
 * Returns the latest regime assessment without running the full pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';
import { computeUnifiedRegime, type RegimeSourceInputs } from '@/lib/quant/regimeEngine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Auth gate: operators only (ms_auth cookie OR admin secret)
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    // Build a lightweight regime snapshot
    // In production this would pull from the latest cached engine data
    const inputs: RegimeSourceInputs = {};
    const regime = computeUnifiedRegime(inputs);

    return NextResponse.json({
      regime,
      note: 'Lightweight regime check. Run full scan for complete regime from all engines.',
    });
  } catch (err: any) {
    console.error('[quant:regime] Error:', err);
    return NextResponse.json(
      { error: 'Regime computation failed', detail: err.message },
      { status: 500 },
    );
  }
}
