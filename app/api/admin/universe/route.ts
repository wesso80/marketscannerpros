/**
 * /api/admin/universe
 * GET    — list operator's personal universe (?includeInactive=1 to include disabled)
 * POST   — upsert entry { symbol, assetClass?, thesis?, tags?, maxPositionUsd?, maxPositionPctEquity?, active? }
 * DELETE — ?symbol=XXX  remove entry
 *
 * Auth: requireAdmin. Workspace-scoped via session.workspaceId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  listUniverse,
  upsertUniverseEntry,
  deleteUniverseEntry,
} from '@/lib/universe/personalUniverse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get('includeInactive') === '1';
  try {
    const entries = await listUniverse(session.workspaceId, includeInactive);
    return NextResponse.json({ ok: true, entries });
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
    const body = await req.json() as {
      symbol?: string;
      assetClass?: string;
      thesis?: string | null;
      tags?: string[];
      maxPositionUsd?: number | null;
      maxPositionPctEquity?: number | null;
      active?: boolean;
    };
    if (!body.symbol || typeof body.symbol !== 'string') {
      return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
    }
    const entry = await upsertUniverseEntry({
      workspaceId: session.workspaceId,
      symbol: body.symbol,
      assetClass: body.assetClass,
      thesis: body.thesis ?? null,
      tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [],
      maxPositionUsd: body.maxPositionUsd ?? null,
      maxPositionPctEquity: body.maxPositionPctEquity ?? null,
      active: body.active,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
  try {
    const removed = await deleteUniverseEntry(session.workspaceId, symbol);
    return NextResponse.json({ ok: true, removed });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
