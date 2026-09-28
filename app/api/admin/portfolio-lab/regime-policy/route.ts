import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { atomicQueries } from '@/lib/db';
import { getRegimeMatrix, upsertRegimeMatrix } from '@/lib/admin/arca-brain/regimePlaybookMatrix';
import { getDefaultPortfolio } from '@/lib/admin/portfolio-lab/portfolioStore';
import { writeJournal } from '@/lib/admin/portfolio-lab/journalEngine';
import { ARCA_DEFAULT_PORTFOLIO_NAME } from '@/lib/admin/portfolio-lab/constants';
import { baselinePaperPolicies, installMissingPaperPolicies, PAPER_POLICY_VERSION } from '@/lib/admin/portfolio-lab/paperRegimePolicy';
import { loadPaperRegimeContext, paperRegimeSummary } from '@/lib/admin/portfolio-lab/paperRegime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try {
    const context = await loadPaperRegimeContext(auth.workspaceId);
    return NextResponse.json({ version: PAPER_POLICY_VERSION, policies: context.policies,
      baseline: baselinePaperPolicies(auth.workspaceId, auth.cid ?? 'admin'),
      readiness: paperRegimeSummary(context, auth.workspaceId) });
  } catch {
    return NextResponse.json({ error: 'Could not load regime policies or evidence.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const baseline = baselinePaperPolicies(auth.workspaceId, auth.cid ?? 'admin');
  const selected = baseline.find(p => p.regime === body?.regime);
  if (!['install-missing-baseline', 'apply-baseline-rule', 'stand-down'].includes(body?.action) ||
      (body.action !== 'install-missing-baseline' && !selected)) {
    return NextResponse.json({ error: 'Unknown policy action or market/regime' }, { status: 400 });
  }
  try {
    const result = await atomicQueries(async () => {
      const portfolio = await getDefaultPortfolio(auth.workspaceId!, ARCA_DEFAULT_PORTFOLIO_NAME);
      if (!portfolio || portfolio.mode !== 'SIMULATED') throw new Error('Simulated portfolio required');
      const previous = selected ? await getRegimeMatrix(auth.workspaceId!, selected.regime) : null;
      const inserted = body.action === 'install-missing-baseline'
        ? await installMissingPaperPolicies(auth.workspaceId!, auth.cid ?? 'admin')
        : [await upsertRegimeMatrix({ ...selected!,
          ...(body.action === 'stand-down' ? { enabledPlaybooks: [], reducedSizePlaybooks: [], requiredConfirmations: [],
            notes: `${PAPER_POLICY_VERSION}: operator stand-down; no new entries.` } : {}),
        })];
      if (inserted.length) await writeJournal({ workspaceId: auth.workspaceId!, portfolioId: portfolio.id,
        journalType: 'REVIEW', title: `Paper regime policy ${body.action}: ${PAPER_POLICY_VERSION}`,
        reasoning: body.action === 'install-missing-baseline'
          ? 'Operator installed missing paper policy keys. Existing policies and account limits were preserved.'
          : `Operator applied ${body.action} to ${selected!.regime}. Previous policy: ${JSON.stringify(previous)}. Account limits preserved.`,
        evidence: inserted.map(p => `${p.regime}: reduced=[${p.reducedSizePlaybooks.join(',')}] confirmations=[${p.requiredConfirmations.join(',')}] rule=${p.id}`),
      });
      return { inserted: inserted.map(p => p.regime), version: PAPER_POLICY_VERSION };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'Simulated portfolio required'
      ? error.message : 'Could not save the policy and its audit record; no change was committed.' }, { status: 503 });
  }
}
