import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// GET /api/alerts/recent - Get recently triggered alerts for toast notifications
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ alerts: [] }); // Return empty for unauthenticated
    }

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');

    // Default to last 5 minutes if no since parameter
    const sinceTime = since 
      ? new Date(since).toISOString()
      : new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Get recently triggered, unacknowledged alerts
    const alerts = await q(`
      SELECT 
        h.id,
        a.symbol,
        a.condition_type AS condition,
        a.condition_value AS target_price,
        h.trigger_price AS triggered_price,
        h.triggered_at
      FROM alert_history h
      JOIN alerts a ON h.alert_id = a.id
      WHERE h.workspace_id = $1
        AND h.triggered_at > $2
        AND h.acknowledged_at IS NULL
      ORDER BY h.triggered_at DESC
      LIMIT 5
    `, [session.workspaceId, sinceTime]);

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching recent alerts:', error);
    return NextResponse.json({ alerts: [] });
  }
}
