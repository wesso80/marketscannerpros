import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/analytics/heartbeat
 * Records a user/session heartbeat for live presence tracking.
 * Works for both anonymous and logged-in users.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 128) : null;
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    const currentPath = typeof body.current_path === 'string' ? body.current_path.slice(0, 512) : null;
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 512) || null;

    // Get logged-in user info if available (don't fail if anonymous)
    let userId: string | null = null;
    let workspaceId: string | null = null;
    try {
      const session = await getSessionFromCookie();
      // Only use values that are valid UUIDs (anon- prefixed IDs are not valid for UUID columns)
      if (session?.cid && UUID_RE.test(session.cid)) userId = session.cid;
      if (session?.workspaceId && UUID_RE.test(session.workspaceId)) workspaceId = session.workspaceId;
    } catch {
      // Anonymous — that's fine
    }

    // UPSERT: insert or update last_seen + current_path
    await q(
      `INSERT INTO active_sessions (session_id, user_id, workspace_id, last_seen, current_path, user_agent)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET
         last_seen    = NOW(),
         current_path = EXCLUDED.current_path,
         user_id      = COALESCE(EXCLUDED.user_id, active_sessions.user_id),
         workspace_id = COALESCE(EXCLUDED.workspace_id, active_sessions.workspace_id),
         user_agent   = COALESCE(EXCLUDED.user_agent, active_sessions.user_agent)`,
      [sessionId, userId, workspaceId, currentPath, userAgent]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[heartbeat] error:', err);
    // Fail gracefully — never break the client
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
