import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * Alert History API
 * 
 * GET - Get triggered alert history
 * POST - Acknowledge/dismiss alert
 */

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const alertId = url.searchParams.get('alertId');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const unacknowledgedOnly = url.searchParams.get('unacknowledged') === 'true';

    let query = `
      SELECT 
        h.id, h.alert_id, h.triggered_at, h.trigger_price, h.condition_met,
        h.symbol, h.condition_type, h.condition_value,
        h.notification_sent, h.notification_channel, h.acknowledged_at, h.user_action,
        a.name as alert_name, a.is_active as alert_active
      FROM alert_history h
      LEFT JOIN alerts a ON h.alert_id = a.id
      WHERE h.workspace_id = $1
    `;
    const params: any[] = [session.workspaceId];
    let paramIndex = 2;

    if (alertId) {
      query += ` AND h.alert_id = $${paramIndex}`;
      params.push(alertId);
      paramIndex++;
    }

    if (unacknowledgedOnly) {
      query += ` AND h.acknowledged_at IS NULL`;
    }

    query += ` ORDER BY h.triggered_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const history = await q(query, params);

    // Get stats
    const statsResult = await q(
      `SELECT 
        COUNT(*) as total_triggers,
        COUNT(*) FILTER (WHERE acknowledged_at IS NULL) as unacknowledged,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '7 days') as last_7d
       FROM alert_history
       WHERE workspace_id = $1`,
      [session.workspaceId]
    );

    return NextResponse.json({
      history,
      stats: {
        total: parseInt(statsResult[0]?.total_triggers || '0'),
        unacknowledged: parseInt(statsResult[0]?.unacknowledged || '0'),
        last24h: parseInt(statsResult[0]?.last_24h || '0'),
        last7d: parseInt(statsResult[0]?.last_7d || '0'),
      },
    });
  } catch (error) {
    console.error('Alert history GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch alert history' }, { status: 500 });
  }
}

// POST - Acknowledge alert
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { historyId, action } = await req.json();

    if (!historyId) {
      return NextResponse.json({ error: 'History ID required' }, { status: 400 });
    }

    const validActions = ['dismissed', 'snoozed', 'traded', 'acknowledged'];
    const userAction = validActions.includes(action) ? action : 'acknowledged';

    const result = await q(
      `UPDATE alert_history 
       SET acknowledged_at = NOW(), user_action = $1
       WHERE id = $2 AND workspace_id = $3
       RETURNING *`,
      [userAction, historyId, session.workspaceId]
    );

    if (!result.length) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, history: result[0] });
  } catch (error) {
    console.error('Alert history POST error:', error);
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }
}
