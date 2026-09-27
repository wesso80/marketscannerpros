import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readSavedScan } from '@/lib/admin/sharedScan';
import { enrichStoredPositionEvidence } from '@/lib/admin/decisionEvidence';
import { assessPosition, decisionAccount } from '@/lib/admin/decisionDesk';
import { buildAdminScanContext } from '@/lib/admin/scan-context';
import { readStoredMacroEvidence } from '@/lib/admin/macroOutlook';
import { DECISION_ACTIONS, readDecisions, reviewCheckpoints, saveDecision, type DecisionAction } from '@/lib/admin/decisionRecords';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  try { const result = await readDecisions(auth.workspaceId);
    return NextResponse.json({ ...result, records: result.records.map(r => ({ ...r, checkpoints: reviewCheckpoints(r.created_at) })) }, { headers });
  } catch { return NextResponse.json({ error: 'Decision history unavailable' }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  // Browser-origin writes must come from this application, not a third-party form.
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin rejected' }, { status: 403, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
  if (!body || typeof body.symbol !== 'string' || !/^[A-Z0-9.\-]{1,15}$/.test(body.symbol) ||
    !['EQUITIES','CRYPTO'].includes(body.market) || !DECISION_ACTIONS.includes(body.action) ||
    typeof body.note !== 'string' || body.note.trim().length < 10 || body.note.length > 2000 ||
    typeof body.evidenceId !== 'string' || !/^[a-f0-9]{64}$/.test(body.evidenceId) ||
    typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId)) {
    return NextResponse.json({ error: 'Valid symbol, market, research action, evidence ID, request UUID and 10–2000 character note required.' }, { status: 400, headers });
  }
  try {
    const [view, {risk}, macro] = await Promise.all([
      readSavedScan({ market: body.market, timeframe: '15m', symbols: [body.symbol] }),
      buildAdminScanContext(auth.workspaceId), readStoredMacroEvidence(),
    ]);
    const [packet] = await enrichStoredPositionEvidence(view.packets);
    if (!packet) return NextResponse.json({ error: 'Saved evidence unavailable' }, { status: 409, headers });
    const assessment = assessPosition(packet);
    if (assessment.evidenceId !== body.evidenceId) return NextResponse.json({ error: 'Evidence changed. Refresh and review before saving.' }, { status: 409, headers });
    const price = packet.snapshot.price;
    const record = await saveDecision(auth.workspaceId, { requestId: body.requestId, action: body.action as DecisionAction,
      note: body.note.trim(), assessment, account: decisionAccount(risk), macro,
      referencePrice: Number.isFinite(price) && price > 0 ? price : null, referenceAt: packet.savedScan.scannedAt });
    return NextResponse.json({ ok: true, record: { ...record, checkpoints: reviewCheckpoints(record.created_at) } }, { status: 201, headers });
  } catch { return NextResponse.json({ error: 'Decision could not be saved. No trading action was requested.' }, { status: 503, headers }); }
}
