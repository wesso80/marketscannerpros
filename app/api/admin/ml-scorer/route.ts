/**
 * GET  /api/admin/ml-scorer        — train + return latest model stats
 * POST /api/admin/ml-scorer        — predict for a body of setup features
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { trainModel, scoreSetup, topWeightedFeatures } from '@/lib/ml/scorer';
import { extractFeatures, type SetupFeatureInput } from '@/lib/ml/features';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const model = await trainModel(session.workspaceId);
    return NextResponse.json({
      ok: true,
      model: {
        n: model.n,
        bias: model.bias,
        trainedAt: model.trainedAt,
        trainLogLoss: model.trainLogLoss,
        trainAcc: model.trainAcc,
        topFeatures: topWeightedFeatures(model, 12),
      },
      // Warn UI if training set is too small to trust.
      reliable: model.n >= 30,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { features: SetupFeatureInput };
    if (!body?.features) {
      return NextResponse.json({ ok: false, error: 'features required' }, { status: 400 });
    }
    const model = await trainModel(session.workspaceId);
    const vector = extractFeatures(body.features);
    const probability = scoreSetup(model, vector);
    return NextResponse.json({
      ok: true,
      probability,
      reliable: model.n >= 30,
      modelN: model.n,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
