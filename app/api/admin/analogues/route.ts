/**
 * /api/admin/analogues
 *
 * POST { features, k?, excludeSetupId? } — find analogue setups
 * POST { backfill: true, limit? }        — embed any missing rows
 *
 * Returns { ok:false, reason:'pgvector-unavailable' } if the extension
 * is not installed — never falls back to fake similarity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { storedTruth } from '@/lib/admin/truthLayer';
import { requireAdmin } from '@/lib/adminAuth';
import { findAnalogues, backfillEmbeddings } from '@/lib/analogues/search';
import type { SetupFeatures } from '@/lib/analogues/featureEmbedding';

import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json() as {
      backfill?: boolean;
      limit?: number;
      features?: SetupFeatures;
      k?: number;
      excludeSetupId?: number;
    };
    if (body.backfill) {
      const out = await backfillEmbeddings(session.workspaceId, body.limit ?? 500);
      return NextResponse.json({ ...out, truth: storedTruth({ source: 'setup analogue store (pgvector)', dataAsOf: null, staleAfterMinutes: 24 * 60 }) });
    }
    if (!body.features) {
      return NextResponse.json({ ok: false, error: 'features required' }, { status: 400 });
    }
    const result = await findAnalogues({
      workspaceId: session.workspaceId,
      features: body.features,
      k: body.k,
      excludeSetupId: body.excludeSetupId,
    });
    return NextResponse.json({ ...result, truth: storedTruth({ source: 'setup analogue store (pgvector)', dataAsOf: null, staleAfterMinutes: 24 * 60 }) });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: adminErrorText(e, '/api/admin/analogues') }, { status: 500 });
  }
}
