import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readSavedScan, scanStatusForResponse } from '@/lib/admin/sharedScan';
import { buildAdminScanContext } from '@/lib/admin/scan-context';
import { readStoredMacroEvidence } from '@/lib/admin/macroOutlook';
import { buildDecisionAssessments, decisionAccount, DECISION_STRATEGIES } from '@/lib/admin/decisionDesk';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only data contract. Never calls a scanner, notification transport, AI model or write path. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  const strategy = req.nextUrl.searchParams.get('strategy');
  if (strategy && strategy !== 'POSITION_6W') return NextResponse.json({ error: 'Only POSITION_6W assessments are implemented.', strategies: DECISION_STRATEGIES }, { status: 400, headers });
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if (symbol && !/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return NextResponse.json({ error: 'Invalid symbol' }, { status: 400, headers });
  try {
    const [equities, crypto, { risk }, macro] = await Promise.all([
      readSavedScan({ market: 'EQUITIES', timeframe: '15m' }),
      readSavedScan({ market: 'CRYPTO', timeframe: '15m' }),
      buildAdminScanContext(auth.workspaceId), readStoredMacroEvidence(),
    ]);
    const assessments = buildDecisionAssessments([...equities.packets, ...crypto.packets]).filter(row => !symbol || row.symbol === symbol);
    const counts = { total: assessments.length, REVIEW_REQUIRED: 0, WATCH: 0, INVALIDATED: 0, DATA_UNAVAILABLE: 0 };
    for (const row of assessments) counts[row.status]++;
    return NextResponse.json({ schemaVersion: 'decision-desk.v1', servedAt: new Date().toISOString(),
      readOnly: true, strategies: DECISION_STRATEGIES, account: decisionAccount(risk), macro, counts, assessments,
      savedScans: { equities: scanStatusForResponse(equities), crypto: scanStatusForResponse(crypto) },
      limitations: ['Position levels do not establish a six-week forecasting edge.', 'Core trend and macro hedge assessments are not implemented.', 'Human decision persistence and 42/84-day strategy outcome tracking are not implemented in this contract.'],
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Decision evidence unavailable; do not reuse an earlier response as current clearance.' }, { status: 503, headers });
  }
}
