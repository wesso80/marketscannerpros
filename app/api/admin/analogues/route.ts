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
import { requireAdmin } from '@/lib/adminAuth';
import { findAnalogues, backfillEmbeddings } from '@/lib/analogues/search';
import type { SetupFeatures } from '@/lib/analogues/featureEmbedding';

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
      return NextResponse.json(out);
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
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
