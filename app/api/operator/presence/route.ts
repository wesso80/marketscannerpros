import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

function toFinite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [stateRows, directionRows, attentionRows, pendingTaskRows] = await Promise.all([
      q(
        `SELECT current_focus, active_candidates, risk_environment, ai_attention_score, user_mode, cognitive_load, context_state, updated_at
         FROM operator_state
         WHERE workspace_id = $1
         LIMIT 1`,
        [session.workspaceId]
      ),
      q(
        `SELECT
           SUM(CASE WHEN event_data->'payload'->>'direction' = 'long' THEN 1 ELSE 0 END)::int AS bullish_count,
           SUM(CASE WHEN event_data->'payload'->>'direction' = 'short' THEN 1 ELSE 0 END)::int AS bearish_count,
           COUNT(*)::int AS total_count
         FROM ai_events
         WHERE workspace_id = $1
           AND event_type = 'signal.created'
           AND created_at >= NOW() - INTERVAL '8 hours'`,
        [session.workspaceId]
      ),
      q(
        `SELECT
           event_data->'entity'->>'symbol' AS symbol,
           COUNT(*)::int AS hits,
           MAX(created_at) AS last_seen,
           MAX((event_data->'payload'->>'final_confidence')::numeric) AS confidence
         FROM ai_events
         WHERE workspace_id = $1
           AND event_type = 'candidate.created'
           AND created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY event_data->'entity'->>'symbol'
         ORDER BY confidence DESC NULLS LAST, hits DESC, last_seen DESC
         LIMIT 3`,
        [session.workspaceId]
      ),
      q(
        `WITH suggested AS (
           SELECT
             event_data->'payload'->>'task_id' AS task_id,
             event_data->'payload'->>'action' AS action,
             event_data->'payload'->>'detail' AS detail,
             event_data->'payload'->>'priority' AS priority,
             event_data->'entity'->>'symbol' AS symbol,
             created_at,
             ROW_NUMBER() OVER (
               PARTITION BY event_data->'payload'->>'task_id'
               ORDER BY created_at DESC
             ) AS rn
           FROM ai_events
           WHERE workspace_id = $1
             AND event_type = 'strategy.rule.suggested'
         ),
         applied AS (
           SELECT DISTINCT event_data->'payload'->>'task_id' AS task_id
           FROM ai_events
           WHERE workspace_id = $1
             AND event_type = 'strategy.rule.applied'
         )
         SELECT s.task_id, s.action, s.detail, s.priority, s.symbol, s.created_at
         FROM suggested s
         LEFT JOIN applied a ON a.task_id = s.task_id
         WHERE s.rn = 1
           AND s.task_id IS NOT NULL
           AND s.task_id <> ''
           AND a.task_id IS NULL
         ORDER BY s.created_at DESC
         LIMIT 3`,
        [session.workspaceId]
      ),
    ]);

    const state = stateRows[0] as Record<string, any> | undefined;
    const direction = (directionRows[0] || {}) as Record<string, any>;

    const bullishCount = Number(direction.bullish_count || 0);
    const bearishCount = Number(direction.bearish_count || 0);
    const totalSignals = Number(direction.total_count || 0);

    const marketBias = totalSignals === 0
      ? 'neutral'
      : bullishCount >= bearishCount * 1.2
      ? 'risk_on'
      : bearishCount >= bullishCount * 1.2
      ? 'risk_off'
      : 'balanced';

    const volatilityState = toFinite(state?.ai_attention_score, 50) >= 70
      ? 'expansion'
      : toFinite(state?.ai_attention_score, 50) <= 35
      ? 'compression'
      : 'normal';

    const topAttention = attentionRows
      .map((row: any) => ({
        symbol: String(row.symbol || '').toUpperCase(),
        confidence: toFinite(Number(row.confidence), 0),
        hits: Number(row.hits || 0),
      }))
      .filter((item: any) => item.symbol);

    const pendingTasks = pendingTaskRows.map((row: any) => ({
      taskId: String(row.task_id || ''),
      action: String(row.action || 'action'),
      detail: String(row.detail || ''),
      priority: String(row.priority || 'medium'),
      symbol: row.symbol ? String(row.symbol) : null,
      createdAt: row.created_at,
    }));

    const firstTask = pendingTasks[0] || null;
    const suggestedActions: Array<{ key: string; label: string; reason: string }> = [];

    if (firstTask) {
      const actionKey = String(firstTask.action || '').toLowerCase();
      if (actionKey.includes('alert')) {
        suggestedActions.push({ key: 'create_alert', label: 'Create Alert', reason: firstTask.detail || 'Top coach action pending.' });
      } else if (actionKey.includes('backtest')) {
        suggestedActions.push({ key: 'run_backtest', label: 'Run Quick Backtest', reason: firstTask.detail || 'Coach recommends validation.' });
      } else {
        suggestedActions.push({ key: 'prepare_trade_plan', label: 'Prepare Trade Plan', reason: firstTask.detail || 'Coach suggests plan refinement.' });
      }
    }

    if (topAttention.length > 0) {
      suggestedActions.push({
        key: 'review_top_attention',
        label: 'Review Top Attention',
        reason: `${topAttention[0].symbol} currently leads confidence ranking.`,
      });
    }

    if (!suggestedActions.length) {
      suggestedActions.push({
        key: 'scan_market',
        label: 'Run Market Scan',
        reason: 'No urgent task in queue — refresh the candidate stack.',
      });
    }

    const cognitiveLoad = clamp(toFinite(state?.cognitive_load, toFinite(state?.ai_attention_score, 50)), 0, 100);

    return NextResponse.json({
      presence: {
        marketState: {
          marketBias,
          volatilityState,
          userMode: state?.user_mode || 'OBSERVE',
          updatedAt: state?.updated_at || null,
        },
        riskLoad: {
          userRiskLoad: cognitiveLoad,
          environment: state?.risk_environment || 'MODERATE',
        },
        topAttention,
        suggestedActions,
        pendingTaskCount: pendingTasks.length,
        pendingTasks,
      },
    });
  } catch (error) {
    console.error('Operator presence GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch operator presence' }, { status: 500 });
  }
}
