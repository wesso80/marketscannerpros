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

    // TODO: Pull actual trade metrics from review history; until then, return insufficient_history status.
    // Do NOT surface these zeros as model learning results.
    const tradeCount = 0; // replace with real DB query when history exists
    const MINIMUM_SAMPLE = 30;
    const hasEnoughHistory = tradeCount >= MINIMUM_SAMPLE;

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
        minSampleSize: MINIMUM_SAMPLE,
      },
    };

    const result = analyzeLearningWindow(windowReq, placeholderMetrics, tradeCount);

    return NextResponse.json({
      ok: true,
      learningStatus: hasEnoughHistory ? 'active' : 'insufficient_history',
      tradeCount,
      minimumSampleRequired: MINIMUM_SAMPLE,
      currentWeights,
      learningWindow: hasEnoughHistory ? result : null,
      note: hasEnoughHistory
        ? 'Learning active. Adaptive weight adjustments available.'
        : `Insufficient history. Requires ${MINIMUM_SAMPLE} reviewed trades for adaptive adjustments. Current: ${tradeCount}. Weights shown are defaults only \u2014 not calibrated from outcomes.`,
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
