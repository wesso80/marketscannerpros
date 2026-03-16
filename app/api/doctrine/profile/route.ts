/* ═══════════════════════════════════════════════════════════════════════════
   API: /api/doctrine/profile — GET personal learning profile
   Returns doctrine stats, best/worst setups, regime performance, edge score.
   ═══════════════════════════════════════════════════════════════════════════ */

import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getPersonalProfile } from '@/lib/doctrine/stats';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const profile = await getPersonalProfile(session.workspaceId);
    return NextResponse.json(profile);
  } catch (err) {
    console.error('[doctrine/profile] Error:', err);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}
