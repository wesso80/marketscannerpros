/**
 * GET /api/admin/playbooks
 *
 * Lists the registered playbooks. Used by /admin/playbooks page and by
 * the Pre-Trade Checklist UI to look up triggers/invalidations.
 *
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { PLAYBOOKS, listPlaybooks } from '@/lib/playbooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const direction = url.searchParams.get('direction') as 'long' | 'short' | null;
  const playbooks = direction === 'long' || direction === 'short'
    ? listPlaybooks({ direction })
    : [...PLAYBOOKS];
  return NextResponse.json({
    ok: true,
    count: playbooks.length,
    playbooks,
  });
}
