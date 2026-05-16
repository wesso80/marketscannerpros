/**
 * POST /api/admin/pre-trade-checklist
 *
 * Body:
 *   {
 *     symbol: string,
 *     setupId?: number,
 *     playbookId?: string,
 *     observedRegime?: string,
 *     evidenceQuality?: number,
 *     ivBucket?: 'iv<30' | 'iv30-70' | 'iv>70',
 *     freshness?: 'real-time' | 'delayed' | 'stale' | 'missing',
 *     proposedSizePct?: number,
 *     currentExposure?: { sameSymbolPct?: number; sameSectorPct?: number },
 *     persist?: boolean,
 *     operatorAction?: 'taken' | 'skipped' | 'pending',
 *     overrideReason?: string
 *   }
 *
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { runChecklist, persistChecklist } from '@/lib/preTrade/checklist';
import type { ChecklistInput } from '@/lib/preTrade/checklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const workspaceId = session.workspaceId;
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'No workspace' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const symbol = typeof body.symbol === 'string' ? body.symbol : null;
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
  }

  const input: ChecklistInput = {
    workspaceId,
    symbol,
    setupId: typeof body.setupId === 'number' ? body.setupId : undefined,
    playbookId: typeof body.playbookId === 'string' ? body.playbookId : null,
    observedRegime: body.observedRegime as ChecklistInput['observedRegime'],
    evidenceQuality: typeof body.evidenceQuality === 'number' ? body.evidenceQuality : null,
    ivBucket: body.ivBucket as ChecklistInput['ivBucket'],
    freshness: body.freshness as ChecklistInput['freshness'],
    proposedSizePct: typeof body.proposedSizePct === 'number' ? body.proposedSizePct : null,
    currentExposure: typeof body.currentExposure === 'object' && body.currentExposure !== null
      ? body.currentExposure as ChecklistInput['currentExposure']
      : undefined,
  };

  const result = await runChecklist(input);

  let persistedId: number | null = null;
  if (body.persist === true) {
    const opAction = body.operatorAction as 'taken' | 'skipped' | 'pending' | undefined;
    const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason : undefined;
    persistedId = await persistChecklist(input, result, opAction, overrideReason);

    // If the operator overrode a no-go / caution recommendation and TOOK the trade,
    // mirror the decision into edge_ledger_self_attribution so behavioral-drift can
    // reason about discipline. Best-effort: never block the checklist write.
    const tookOverride =
      opAction === 'taken' &&
      (result.recommendation === 'no-go' || result.recommendation === 'caution') &&
      typeof input.setupId === 'number';
    if (tookOverride) {
      try {
        const { recordSelfAttribution } = await import('@/lib/edge/ledger');
        await recordSelfAttribution({
          workspaceId,
          setupId: input.setupId as number,
          action: 'taken',
          overrideReason: overrideReason ?? `override:${result.recommendation}`,
          checklistOverrides: [...result.blockingGates, ...result.warningGates],
        });
      } catch {
        // swallow — checklist row already persisted; attribution is supplemental
      }
    }
  }

  return NextResponse.json({ ok: true, result, persistedId });
}
