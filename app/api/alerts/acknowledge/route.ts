import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// POST /api/alerts/acknowledge - Mark an alert trigger as seen
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { historyId } = await req.json();

    if (!historyId) {
      return NextResponse.json({ error: 'historyId required' }, { status: 400 });
    }

    // Mark as acknowledged (only if it belongs to this workspace)
    await q(
      `UPDATE alert_history 
       SET acknowledged_at = NOW(), user_action = 'dismissed'
       WHERE id = $1 AND workspace_id = $2`,
      [historyId, session.workspaceId]
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return NextResponse.json({ error: 'Failed to acknowledge' }, { status: 500 });
  }
}
