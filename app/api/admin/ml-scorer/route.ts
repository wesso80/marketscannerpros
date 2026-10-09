/**
 * GET  /api/admin/ml-scorer        — train + return latest model stats
 * POST /api/admin/ml-scorer        — predict for a body of setup features
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { MIN_TRAINING_SETUPS, trainModel, scoreSetup, topWeightedFeatures } from '@/lib/ml/scorer';
import { extractFeatures, type SetupFeatureInput } from '@/lib/ml/features';

import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const model = await trainModel(session.workspaceId);
    const reliable = model.n >= MIN_TRAINING_SETUPS;
    // Below the minimum, weights / fit figures describe memorised examples, so they are withheld.
    return NextResponse.json({
      ok: true,
      model: reliable
        ? { n: model.n, bias: model.bias, trainedAt: model.trainedAt, trainLogLoss: model.trainLogLoss, trainAcc: model.trainAcc, topFeatures: topWeightedFeatures(model, 12) }
        : { n: model.n, trainedAt: model.trainedAt },
      reliable,
      minTrainingSetups: MIN_TRAINING_SETUPS,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: adminErrorText(e, '/api/admin/ml-scorer') }, { status: 500 });
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
    if (model.n < MIN_TRAINING_SETUPS) {
      return NextResponse.json({
        ok: true, probability: null, reliable: false, modelN: model.n, minTrainingSetups: MIN_TRAINING_SETUPS,
        reason: `Not enough resolved setups (${model.n} of ${MIN_TRAINING_SETUPS}); no prediction.`,
      });
    }
    const probability = scoreSetup(model, extractFeatures(body.features));
    return NextResponse.json({ ok: true, probability, reliable: true, modelN: model.n, minTrainingSetups: MIN_TRAINING_SETUPS });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: adminErrorText(e, '/api/admin/ml-scorer') }, { status: 500 });
  }
}
