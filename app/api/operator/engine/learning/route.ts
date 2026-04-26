/**
 * GET /api/operator/engine/learning — Learning engine analysis
 * POST /api/operator/engine/learning — Apply weight adjustments
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { analyzeLearningWindow, applyAdjustments, loadActiveWeights, saveWeights } from '@/lib/operator/learning-engine';
import { DEFAULT_SCORING_WEIGHTS } from '@/lib/operator/shared';
import type { LearningWindowRequest } from '@/types/operator';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): Promise<boolean> {
  return (async () => {
    if ((await requireAdmin(req)).ok) return true;
    const session = await getSessionFromCookie();
    return !!(session && isOperator(session.cid, session.workspaceId));
  })();
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // Load persisted weights (falls back to defaults if no DB rows)
    const currentWeights = await loadActiveWeights();

    // TODO: Pull actual trade metrics from review history
    const placeholderMetrics = {
      winRate: 0,
      expectancyR: 0,
      avgMaeR: 0,
      avgMfeR: 0,
    };

    const windowReq: LearningWindowRequest = {
      scope: { type: 'GLOBAL' },
      window: {
        start: new Date(Date.now() - 30 * 86400000).toISOString(),
        end: new Date().toISOString(),
        minSampleSize: 30,
      },
    };

    const result = analyzeLearningWindow(windowReq, placeholderMetrics, 0);

    return NextResponse.json({
      ok: true,
      currentWeights,
      learningWindow: result,
      note: 'No trade history yet. Requires 30+ reviewed trades for adaptive adjustments.',
    });
  } catch (err: unknown) {
    console.error('[operator:engine:learning] Error:', err);
    return NextResponse.json(
      { error: 'Learning analysis failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const adjustments = body.adjustments;
    const mode = body.mode || 'MANUAL_APPROVED';

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return NextResponse.json({ error: 'adjustments array is required' }, { status: 400 });
    }

    // Load current weights from DB (or defaults)
    const currentWeights = await loadActiveWeights();

    const newWeights = applyAdjustments(
      { adjustments, approvedBy: 'operator', mode },
      { ...currentWeights },
    );

    // Persist to database
    await saveWeights(newWeights, currentWeights, adjustments, mode, 'operator');

    return NextResponse.json({
      ok: true,
      previousWeights: currentWeights,
      newWeights,
      appliedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[operator:engine:learning] Error:', err);
    return NextResponse.json(
      { error: 'Weight adjustment failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
