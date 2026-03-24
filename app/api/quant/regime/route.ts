/**
 * GET /api/quant/regime — Current unified regime state
 *
 * PRIVATE — requires admin authentication.
 * Returns the latest regime assessment without running the full pipeline.
 */

import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeUnifiedRegime, type RegimeSourceInputs } from '@/lib/quant/regimeEngine';

export const runtime = 'nodejs';

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function isOperator(cid: string): boolean {
  const lower = cid.toLowerCase();
  return OPERATOR_EMAILS.some(email =>
    lower === email || lower.endsWith(`_${email}`),
  );
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
