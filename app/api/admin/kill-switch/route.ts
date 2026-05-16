/**
 * /api/admin/kill-switch
 * GET — current state + recent log
 * POST { enabled: boolean, reason?: string } — toggle
 *
 * When the kill switch is enabled, callers (alert dispatcher,
 * notification senders, autonomous routines) must check
 * isKillSwitchOn(workspaceId) and skip emission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  getKillSwitchState,
  setKillSwitch,
  listKillSwitchLog,
} from '@/lib/universe/personalUniverse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [state, log] = await Promise.all([
      getKillSwitchState(session.workspaceId),
      listKillSwitchLog(session.workspaceId, 20),
    ]);
    return NextResponse.json({ ok: true, state, log });
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
    const body = await req.json() as { enabled?: boolean; reason?: string };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'enabled (boolean) required' }, { status: 400 });
    }
    const state = await setKillSwitch({
      workspaceId: session.workspaceId,
      enabled: body.enabled,
      reason: body.reason ?? null,
      actor: 'admin',
    });
    return NextResponse.json({ ok: true, state });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
