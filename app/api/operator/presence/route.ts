import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

function toFinite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type ExperienceModeKey = 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';

type ExperienceModeDefinition = {
  label: string;
  rationale: string;
  directives: {
    showScanner: boolean;
    emphasizeRisk: boolean;
    reduceAlerts: boolean;
    highlightLearning: boolean;
    minimalSurface: boolean;
    quickActions: boolean;
    frictionLevel: 'low' | 'medium' | 'high';
  };
};

function mapIntentDirection(userMode: string): 'scanning' | 'planning' | 'managing_trades' | 'reviewing_performance' {
  const mode = String(userMode || '').toUpperCase();
  if (mode === 'OBSERVE') return 'scanning';
  if (mode === 'EVALUATE') return 'planning';
  if (mode === 'EXECUTE') return 'managing_trades';
  return 'reviewing_performance';
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [
      stateRows,
      directionRows,
      attentionRows,
      pendingTaskRows,
      edgeRows,
      behaviorRows,
      operatorStatsRows,
      openAlertsRows,
    ] = await Promise.all([
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
      q(
        `SELECT
           UPPER(symbol) AS symbol,
           COUNT(*)::int AS sample_size,
           SUM(CASE WHEN outcome = 'win' OR COALESCE(pl, 0) > 0 THEN 1 ELSE 0 END)::int AS wins,
           AVG(COALESCE(pl, 0)) AS avg_pl
         FROM journal_entries
         WHERE workspace_id = $1
           AND is_open = false
           AND (outcome IN ('win', 'loss', 'breakeven') OR pl IS NOT NULL)
         GROUP BY UPPER(symbol)`,
        [session.workspaceId]
      ),
      q(
        `WITH base AS (
           SELECT
             event_type,
             created_at,
             event_data->'correlation'->>'workflow_id' AS workflow_id,
             event_data->'payload'->>'result' AS candidate_result
           FROM ai_events
           WHERE workspace_id = $1
             AND created_at >= NOW() - INTERVAL '30 days'
             AND event_type IN ('candidate.created', 'trade.plan.created', 'trade.executed', 'trade.closed')
         ),
         candidate_pass AS (
           SELECT workflow_id, MIN(created_at) AS candidate_at
           FROM base
           WHERE event_type = 'candidate.created'
             AND candidate_result = 'pass'
             AND workflow_id IS NOT NULL
             AND workflow_id <> ''
           GROUP BY workflow_id
         ),
         planned AS (
           SELECT workflow_id, MIN(created_at) AS planned_at
           FROM base
           WHERE event_type = 'trade.plan.created'
             AND workflow_id IS NOT NULL
             AND workflow_id <> ''
           GROUP BY workflow_id
         ),
         executed AS (
           SELECT workflow_id, MIN(created_at) AS executed_at
           FROM base
           WHERE event_type = 'trade.executed'
             AND workflow_id IS NOT NULL
             AND workflow_id <> ''
           GROUP BY workflow_id
         ),
         closed AS (
           SELECT workflow_id, MIN(created_at) AS closed_at
           FROM base
           WHERE event_type = 'trade.closed'
             AND workflow_id IS NOT NULL
             AND workflow_id <> ''
           GROUP BY workflow_id
         ),
         late_entries AS (
           SELECT
             COUNT(*) FILTER (WHERE e.executed_at - p.planned_at > INTERVAL '45 minutes')::int AS late_count,
             COUNT(*)::int AS total_exec_with_plan
           FROM executed e
           JOIN planned p ON p.workflow_id = e.workflow_id
         ),
         early_exits AS (
           SELECT
             COUNT(*) FILTER (WHERE c.closed_at - e.executed_at < INTERVAL '45 minutes')::int AS early_count,
             COUNT(*)::int AS total_closed_with_exec
           FROM closed c
           JOIN executed e ON e.workflow_id = c.workflow_id
         ),
         ignored AS (
           SELECT
             COUNT(*) FILTER (WHERE e.workflow_id IS NULL)::int AS ignored_count,
             COUNT(*)::int AS total_pass_candidates
           FROM candidate_pass cp
           LEFT JOIN executed e
             ON e.workflow_id = cp.workflow_id
             AND e.executed_at >= cp.candidate_at
             AND e.executed_at <= cp.candidate_at + INTERVAL '24 hours'
         )
         SELECT
           le.late_count,
           le.total_exec_with_plan,
           ee.early_count,
           ee.total_closed_with_exec,
           ig.ignored_count,
           ig.total_pass_candidates
         FROM late_entries le
         CROSS JOIN early_exits ee
         CROSS JOIN ignored ig`,
        [session.workspaceId]
      ),
      q(
        `SELECT
           COUNT(*) FILTER (
             WHERE event_type IN ('candidate.created', 'trade.plan.created', 'trade.executed')
           )::int AS actions_8h,
           COUNT(*) FILTER (WHERE event_type = 'trade.executed')::int AS executions_8h,
           COUNT(*) FILTER (WHERE event_type = 'trade.closed')::int AS closed_8h
         FROM ai_events
         WHERE workspace_id = $1
           AND created_at >= NOW() - INTERVAL '8 hours'`,
        [session.workspaceId]
      ),
      q(
        `SELECT
           COUNT(*)::int AS open_alerts
         FROM alerts
         WHERE workspace_id = $1
           AND is_active = true`,
        [session.workspaceId]
      ),
    ]);
    const state = stateRows[0] as Record<string, any> | undefined;
    const direction = (directionRows[0] || {}) as Record<string, any>;

    const bullishCount = Number(direction.bullish_count || 0);
    const bearishCount = Number(direction.bearish_count || 0);
    const totalSignals = Number(direction.total_count || 0);

    const behavior = (behaviorRows[0] || {}) as Record<string, any>;
    const operatorStats = (operatorStatsRows[0] || {}) as Record<string, any>;
    const openAlertsData = (openAlertsRows[0] || {}) as Record<string, any>;
    const lateCount = Number(behavior.late_count || 0);
    const lateTotal = Number(behavior.total_exec_with_plan || 0);
    const earlyCount = Number(behavior.early_count || 0);
    const earlyTotal = Number(behavior.total_closed_with_exec || 0);
    const ignoredCount = Number(behavior.ignored_count || 0);
    const ignoredTotal = Number(behavior.total_pass_candidates || 0);

    const rate = (numerator: number, denominator: number) => {
      if (!denominator) return 0;
      return Number(((numerator / denominator) * 100).toFixed(1));
    };

    const lateEntryPct = rate(lateCount, lateTotal);
    const earlyExitPct = rate(earlyCount, earlyTotal);
    const ignoredSetupPct = rate(ignoredCount, ignoredTotal);

    const actions8h = Number(operatorStats.actions_8h || 0);
    const executions8h = Number(operatorStats.executions_8h || 0);
    const closed8h = Number(operatorStats.closed_8h || 0);
    const openAlerts = Number(openAlertsData.open_alerts || 0);

    const behaviorQuality = clamp(
      100 - (lateEntryPct * 0.4 + earlyExitPct * 0.35 + ignoredSetupPct * 0.25),
      20,
      100
    );

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

    const edgeBySymbol = new Map<string, { sampleSize: number; winRate: number; avgPl: number }>();
    for (const row of edgeRows as any[]) {
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!symbol) continue;
      const sampleSize = Number(row?.sample_size || 0);
      const wins = Number(row?.wins || 0);
      const winRate = sampleSize > 0 ? (wins / sampleSize) * 100 : 0;
      const avgPl = Number(row?.avg_pl || 0);
      edgeBySymbol.set(symbol, { sampleSize, winRate, avgPl });
    }

    const topAttentionRaw = attentionRows
      .map((row: any) => {
        const symbol = String(row.symbol || '').toUpperCase();
        const marketScore = clamp(toFinite(Number(row.confidence), 0), 0, 100);
        const edge = edgeBySymbol.get(symbol);

        const personalEdgePct = edge
          ? edge.sampleSize >= 3
            ? clamp(edge.winRate, 0, 100)
            : 50
          : 50;

        const operatorFit = Number(((marketScore / 100) * (personalEdgePct / 100) * (behaviorQuality / 100) * 100).toFixed(1));

        return {
          symbol,
          confidence: marketScore,
          hits: Number(row.hits || 0),
          personalEdge: Number(personalEdgePct.toFixed(1)),
          operatorFit,
          sampleSize: edge?.sampleSize || 0,
          avgPl: Number((edge?.avgPl || 0).toFixed(2)),
          behaviorQuality: Number(behaviorQuality.toFixed(1)),
        };
      })
      .filter((item: any) => item.symbol)
      .sort((a: any, b: any) => b.operatorFit - a.operatorFit || b.confidence - a.confidence)
      .slice(0, 3);

    const pendingTasks = pendingTaskRows.map((row: any) => ({
      taskId: String(row.task_id || ''),
      action: String(row.action || 'action'),
      detail: String(row.detail || ''),
      priority: String(row.priority || 'medium'),
      symbol: row.symbol ? String(row.symbol) : null,
      createdAt: row.created_at,
    }));

    const firstTask = pendingTasks[0] || null;

    const stateLoad = clamp(toFinite(state?.cognitive_load, toFinite(state?.ai_attention_score, 50)), 0, 100);
    const unresolvedPlans = pendingTasks.length;
    const simultaneousSetups = Number(state?.active_candidates || topAttentionRaw.length || 0);
    const cognitiveLoad = clamp(
      stateLoad * 0.4 +
        unresolvedPlans * 8 +
        simultaneousSetups * 6 +
        openAlerts * 4,
      0,
      100
    );

    const recentLossPressure = closed8h > 0 ? clamp(((closed8h - executions8h) / closed8h) * 100, 0, 100) : 0;
    const operatorReality = cognitiveLoad >= 78 || behaviorQuality < 55 || recentLossPressure >= 60
      ? 'overextended'
      : cognitiveLoad <= 58 && behaviorQuality >= 70
      ? 'in_rhythm'
      : 'balanced';

    const marketMode = volatilityState === 'expansion' && totalSignals >= 8
      ? 'volatile_expansion'
      : volatilityState === 'compression' || totalSignals <= 2
      ? 'low_volatility_compression'
      : 'balanced_transition';

    const intentDirection = mapIntentDirection(state?.user_mode || 'OBSERVE');

    let experienceModeKey: ExperienceModeKey = 'focus';
    if (operatorReality === 'overextended') {
      experienceModeKey = 'risk_control';
    } else if (intentDirection === 'managing_trades' || executions8h > 0) {
      experienceModeKey = 'focus';
    } else if (marketMode === 'volatile_expansion' && operatorReality === 'in_rhythm' && cognitiveLoad < 70) {
      experienceModeKey = 'hunt';
    } else if (intentDirection === 'reviewing_performance' || closed8h > 0) {
      experienceModeKey = 'learning';
    } else if (marketMode === 'low_volatility_compression') {
      experienceModeKey = 'passive_scan';
    }

    const experienceModes: Record<ExperienceModeKey, ExperienceModeDefinition> = {
      hunt: {
        label: 'Hunt Mode',
        rationale: 'Market is active and operator state is stable — prioritize setup discovery and fast validation.',
        directives: {
          showScanner: true,
          emphasizeRisk: false,
          reduceAlerts: false,
          highlightLearning: false,
          minimalSurface: false,
          quickActions: true,
          frictionLevel: 'low',
        },
      },
      focus: {
        label: 'Focus Mode',
        rationale: 'Execution context is active — shift surface from discovery to risk-managed trade handling.',
        directives: {
          showScanner: false,
          emphasizeRisk: true,
          reduceAlerts: false,
          highlightLearning: false,
          minimalSurface: false,
          quickActions: true,
          frictionLevel: 'medium',
        },
      },
      risk_control: {
        label: 'Risk-Control Mode',
        rationale: 'Cognitive pressure or behavior drift detected — reduce noise and force tighter decision quality.',
        directives: {
          showScanner: false,
          emphasizeRisk: true,
          reduceAlerts: true,
          highlightLearning: false,
          minimalSurface: false,
          quickActions: false,
          frictionLevel: 'high',
        },
      },
      learning: {
        label: 'Learning Mode',
        rationale: 'Recent outcome data is available — prioritize coaching and post-trade pattern reinforcement.',
        directives: {
          showScanner: false,
          emphasizeRisk: false,
          reduceAlerts: true,
          highlightLearning: true,
          minimalSurface: false,
          quickActions: false,
          frictionLevel: 'low',
        },
      },
      passive_scan: {
        label: 'Passive Scan Mode',
        rationale: 'Low-volatility regime — keep a minimal surface and only surface high-conviction opportunities.',
        directives: {
          showScanner: true,
          emphasizeRisk: false,
          reduceAlerts: true,
          highlightLearning: false,
          minimalSurface: true,
          quickActions: false,
          frictionLevel: 'low',
        },
      },
    };

    const experienceMode = experienceModes[experienceModeKey];

    const symbolExperienceModes = topAttentionRaw
      .map((item: any) => {
        const fit = Number(item.operatorFit || 0);
        const confidence = Number(item.confidence || 0);
        const personalEdge = Number(item.personalEdge || 0);

        let symbolModeKey: ExperienceModeKey;
        if (operatorReality === 'overextended') {
          symbolModeKey = 'risk_control';
        } else if (fit >= 70 && confidence >= 65 && marketMode === 'volatile_expansion') {
          symbolModeKey = 'hunt';
        } else if (fit >= 55 && (intentDirection === 'managing_trades' || executions8h > 0)) {
          symbolModeKey = 'focus';
        } else if (personalEdge < 48 || behaviorQuality < 62) {
          symbolModeKey = 'learning';
        } else if (fit < 50) {
          symbolModeKey = 'passive_scan';
        } else {
          symbolModeKey = experienceModeKey;
        }

        const mode = experienceModes[symbolModeKey];
        return {
          symbol: item.symbol,
          operatorFit: fit,
          confidence,
          personalEdge,
          mode: {
            key: symbolModeKey,
            label: mode.label,
            directives: mode.directives,
          },
          reason:
            symbolModeKey === 'hunt'
              ? 'High fit in active regime — elevate setup discovery and quick action.'
              : symbolModeKey === 'focus'
              ? 'Execution context detected — prioritize management and risk control.'
              : symbolModeKey === 'risk_control'
              ? 'Operator pressure elevated — tighten controls and reduce noise.'
              : symbolModeKey === 'learning'
              ? 'Edge quality below threshold — route to review and pattern correction.'
              : 'Conviction is moderate/low — keep symbol in passive monitoring.',
        };
      })
      .filter((item: any) => item.symbol);

    const topAttention = topAttentionRaw.filter((item: any) => {
      if (experienceModeKey !== 'passive_scan') return true;
      return item.operatorFit >= 55;
    });

    const suggestedActions: Array<{ key: string; label: string; reason: string }> = [];

    if (experienceModeKey === 'risk_control') {
      suggestedActions.push({ key: 'prepare_trade_plan', label: 'Run Risk Reset', reason: 'Tighten exposure and confirm stop discipline before any new entry.' });
    } else if (experienceModeKey === 'learning') {
      suggestedActions.push({ key: 'run_backtest', label: 'Review Coach Patterns', reason: 'Reinforce learning from recent trade outcomes before next cycle.' });
    } else if (experienceModeKey === 'hunt') {
      suggestedActions.push({ key: 'scan_market', label: 'Scan for A+ Setups', reason: 'Environment supports active setup hunting with low friction.' });
    }

    if (firstTask && suggestedActions.length < 2) {
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
        reason: `${topAttention[0].symbol} leads operator fit (${topAttention[0].operatorFit.toFixed(1)}).`,
      });
    }

    if (!suggestedActions.length) {
      suggestedActions.push({
        key: 'scan_market',
        label: 'Run Market Scan',
        reason: 'No urgent task in queue — refresh the candidate stack.',
      });
    }

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
        adaptiveInputs: {
          marketReality: {
            mode: marketMode,
            volatilityState,
            signalDensity: totalSignals,
            confluenceDensity: topAttentionRaw.length,
          },
          operatorReality: {
            mode: operatorReality,
            actions8h,
            executions8h,
            closed8h,
            behaviorQuality: Number(behaviorQuality.toFixed(1)),
          },
          cognitiveLoad: {
            level: cognitiveLoad >= 75 ? 'HIGH' : cognitiveLoad >= 55 ? 'MEDIUM' : 'LOW',
            value: Number(cognitiveLoad.toFixed(1)),
            openAlerts,
            unresolvedPlans,
            simultaneousSetups,
          },
          intentDirection,
        },
        experienceMode: {
          key: experienceModeKey,
          label: experienceMode.label,
          rationale: experienceMode.rationale,
          directives: experienceMode.directives,
        },
        behavior: {
          lateEntryPct,
          earlyExitPct,
          ignoredSetupPct,
          behaviorQuality: Number(behaviorQuality.toFixed(1)),
          sample: {
            executionsWithPlan: lateTotal,
            closedWithExecution: earlyTotal,
            passCandidates: ignoredTotal,
          },
        },
        topAttention,
        symbolExperienceModes,
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
