/**
 * GET /api/admin/evening-packet
 *   ?date=YYYY-MM-DD  (optional, defaults to today UTC)
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildEveningPacket } from '@/lib/eveningPacket/builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const dateISO = url.searchParams.get('date') ?? undefined;
  try {
    const packet = await buildEveningPacket(session.workspaceId, { dateISO });
    return NextResponse.json({ ok: true, packet });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
