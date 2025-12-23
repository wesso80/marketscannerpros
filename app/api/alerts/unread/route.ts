import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// GET /api/alerts/unread - Get unacknowledged alert triggers for current user
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ alerts: [] }); // Return empty for non-logged-in users
    }

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');

    // Get recent unacknowledged alerts (last 24 hours, not acknowledged)
    let query = `
      SELECT 
        id,
        symbol,
        condition_met,
        trigger_price,
        triggered_at
      FROM alert_history
      WHERE workspace_id = $1
        AND acknowledged_at IS NULL
        AND triggered_at > NOW() - INTERVAL '24 hours'
    `;
    const params: any[] = [session.workspaceId];

    // If "since" is provided, only get newer alerts
    if (since) {
      query += ` AND triggered_at > $2`;
      params.push(since);
    }

    query += ` ORDER BY triggered_at DESC LIMIT 10`;

    const alerts = await q(query, params);

    return NextResponse.json({ 
      alerts: alerts || [],
      checked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching unread alerts:', error);
    return NextResponse.json({ alerts: [] });
  }
}
