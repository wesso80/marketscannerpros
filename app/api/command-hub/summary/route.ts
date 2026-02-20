import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

function isMissingRelationError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return code === '42P01' || (message.includes('relation') && message.includes('does not exist'));
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;

    const [alertsRows, portfolioRows, journalRows] = await Promise.all([
      q<{ active_alerts: number; triggered_today: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE a.is_active = true)::int AS active_alerts,
           (
             SELECT COUNT(*)::int
             FROM alert_history h
             WHERE h.workspace_id = $1
               AND h.triggered_at >= CURRENT_DATE
           ) AS triggered_today
         FROM alerts a
         WHERE a.workspace_id = $1`,
        [workspaceId]
      ),
      q<{ open_trades: number }>(
        `SELECT COUNT(*)::int AS open_trades
         FROM portfolio_positions
         WHERE workspace_id = $1`,
        [workspaceId]
      ),
      q<{ journal_reviews: number }>(
        `SELECT COUNT(*)::int AS journal_reviews
         FROM journal_entries
         WHERE workspace_id = $1
           AND (
             COALESCE(is_open, false) = true
             OR COALESCE(status, 'OPEN') IN ('OPEN', 'MANAGING', 'EXIT_PENDING', 'FAILED_EXIT')
           )`,
        [workspaceId]
      ),
    ]);

    let optionsSignals = 0;
    let timeWindows = 0;
    let riskEnvironment = 'normal';
    let cognitiveLoad = 0;

    try {
      const [packetRows, operatorRows] = await Promise.all([
        q<{ options_signals: number; time_windows: number }>(
          `SELECT
             COUNT(*) FILTER (
               WHERE status IN ('candidate', 'planned', 'alerted')
                 AND (
                   LOWER(COALESCE(market, '')) = 'options'
                   OR LOWER(COALESCE(signal_source, '')) LIKE '%option%'
                   OR LOWER(COALESCE(packet_data::text, '')) LIKE '%options%'
                 )
             )::int AS options_signals,
             COUNT(*) FILTER (
               WHERE status IN ('candidate', 'planned', 'alerted')
                 AND (
                   LOWER(COALESCE(signal_source, '')) LIKE '%confluence%'
                   OR LOWER(COALESCE(signal_source, '')) LIKE '%time%'
                   OR LOWER(COALESCE(packet_data::text, '')) LIKE '%time confluence%'
                   OR LOWER(COALESCE(packet_data::text, '')) LIKE '%confluence_scan%'
                 )
             )::int AS time_windows
           FROM decision_packets
           WHERE workspace_id = $1
             AND updated_at >= NOW() - INTERVAL '24 hours'`,
          [workspaceId]
        ),
        q<{ risk_environment: string | null; cognitive_load: number | null }>(
          `SELECT risk_environment, cognitive_load
           FROM operator_state
           WHERE workspace_id = $1
           LIMIT 1`,
          [workspaceId]
        ),
      ]);

      optionsSignals = Number(packetRows[0]?.options_signals || 0);
      timeWindows = Number(packetRows[0]?.time_windows || 0);
      riskEnvironment = String(operatorRows[0]?.risk_environment || 'normal');
      cognitiveLoad = Number(operatorRows[0]?.cognitive_load || 0);
    } catch (error) {
      if (!isMissingRelationError(error)) throw error;
    }

    const activeAlerts = Number(alertsRows[0]?.active_alerts || 0);
    const triggeredToday = Number(alertsRows[0]?.triggered_today || 0);
    const openTrades = Number(portfolioRows[0]?.open_trades || 0);
    const journalReviews = Number(journalRows[0]?.journal_reviews || 0);

    const aiConfidence = Math.min(
      92,
      Math.max(
        48,
        56 + Math.round(optionsSignals * 1.8) + Math.round(timeWindows * 2.2) + Math.round(triggeredToday * 1.5)
      )
    );

    const regime = triggeredToday >= 5 || timeWindows >= 3
      ? 'high-vol'
      : triggeredToday >= 2 || timeWindows >= 1
        ? 'active'
        : 'neutral';

    return NextResponse.json({
      summary: {
        activeAlerts,
        triggeredToday,
        openTrades,
        optionsSignals,
        timeWindows,
        journalReviews,
        aiConfidence,
        regime,
        riskEnvironment,
        cognitiveLoad,
      },
    });
  } catch (error) {
    console.error('Command hub summary GET error:', error);
    return NextResponse.json({ error: 'Failed to load command hub summary' }, { status: 500 });
  }
}
