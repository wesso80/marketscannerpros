import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { validateBasicAlertAssetType } from '@/lib/alerts/assetTypes';
import { ALERT_LIMITS } from '@/lib/alerts/planLimits';

/**
 * Price Alerts API
 * 
 * GET - List all alerts for workspace
 * POST - Create new alert
 * PUT - Update existing alert
 * DELETE - Delete alert
 */

// Alert limits: two plans only. Pro (incl. legacy pro_trader) and admins get 999
// active alerts; Free stays at 3. Shared with the Alerts page (lib/alerts/planLimits).
function alertPlan(session: Parameters<typeof hasPaidSessionAccess>[0]): { tier: 'free' | 'pro'; maxAlerts: number } {
  const tier = hasPaidSessionAccess(session) ? 'pro' : 'free';
  return { tier, maxAlerts: ALERT_LIMITS[tier] };
}

// Multi-condition alert condition types
const MULTI_CONDITION_TYPES = [
  'price_above', 'price_below', 
  'percent_change_up', 'percent_change_down',
  'volume_above', 'volume_below', 'volume_spike',
  'rsi_above', 'rsi_below',
  'macd_cross_up', 'macd_cross_down',
  'sma_cross_above', 'sma_cross_below',
  'ema_cross_above', 'ema_cross_below',
  'oi_above', 'oi_below', 'oi_change_up', 'oi_change_down',
  'funding_above', 'funding_below',
];

interface AlertCondition {
  conditionType: string;
  conditionValue: number;
  conditionTimeframe?: string;
  conditionIndicator?: string;
  conditionPeriod?: number;
}

interface AlertPayload {
  symbol: string;
  assetType: 'crypto' | 'equity' | 'forex' | 'commodity';
  conditionType: 'price_above' | 'price_below' | 'percent_change_up' | 'percent_change_down' | 'volume_spike';
  conditionValue: number;
  conditionTimeframe?: string;
  name?: string;
  notes?: string;
  isRecurring?: boolean;
  notifyEmail?: boolean;
  notifyPush?: boolean;
  expiresAt?: string;
  // Smart alert fields
  isSmartAlert?: boolean;
  cooldownMinutes?: number;
  // Multi-condition alert fields
  isMultiCondition?: boolean;
  conditionLogic?: 'AND' | 'OR';
  conditions?: AlertCondition[];
}

// Smart alert condition types (Pro only)
const SMART_ALERT_TYPES = [
  'oi_surge', 'oi_drop',
  'funding_extreme_pos', 'funding_extreme_neg',
  'ls_ratio_high', 'ls_ratio_low',
  'fear_extreme', 'greed_extreme',
  'oi_divergence_bull', 'oi_divergence_bear',
  // Scanner signal alerts - trigger on buy/sell signals
  'scanner_buy_signal', 'scanner_sell_signal',
  'scanner_score_above', 'scanner_score_below',
  'scanner_bullish_flip', 'scanner_bearish_flip',
  // Backtest strategy alerts - trigger on strategy signals
  'strategy_buy_signal', 'strategy_sell_signal',
  'strategy_entry', 'strategy_exit',
];

// GET - List all alerts
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === 'true';
    const symbol = url.searchParams.get('symbol');
    const smartOnly = url.searchParams.get('smart') === 'true';
    const multiOnly = url.searchParams.get('multi') === 'true';
    
    let query = `
      SELECT 
        id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_active, is_recurring, notify_email, notify_push,
        triggered_at, trigger_count, last_price, created_at, updated_at, expires_at,
        is_smart_alert, smart_alert_context, last_derivative_value, cooldown_minutes,
        is_multi_condition, condition_logic
      FROM alerts
      WHERE workspace_id = $1
    `;
    const params: any[] = [session.workspaceId];
    let paramIndex = 2;

    if (activeOnly) {
      query += ` AND is_active = true`;
    }
    
    if (symbol) {
      query += ` AND symbol = $${paramIndex}`;
      params.push(symbol.toUpperCase());
      paramIndex++;
    }

    if (smartOnly) {
      query += ` AND is_smart_alert = true`;
    }

    if (multiOnly) {
      query += ` AND is_multi_condition = true`;
    }

    query += ` ORDER BY created_at DESC`;

    let alerts = await q(query, params);

    // Fetch conditions for multi-condition alerts
    const multiAlertIds = alerts
      .filter((a: any) => a.is_multi_condition)
      .map((a: any) => a.id);

    if (multiAlertIds.length > 0) {
      const conditionsResult = await q(
        `SELECT * FROM alert_conditions WHERE alert_id = ANY($1) ORDER BY condition_order`,
        [multiAlertIds]
      );

      // Group conditions by alert_id
      const conditionsByAlert: Record<string, any[]> = {};
      for (const c of conditionsResult) {
        if (!conditionsByAlert[c.alert_id]) {
          conditionsByAlert[c.alert_id] = [];
        }
        conditionsByAlert[c.alert_id].push(c);
      }

      // Attach conditions to alerts
      alerts = alerts.map((a: any) => ({
        ...a,
        conditions: conditionsByAlert[a.id] || [],
      }));
    }

    // Triggers in the last 24h, counted from alert history. (alert_quotas.total_triggers_today
    // is only ever incremented and never reset, so it is a lifetime total, not "today".)
    const triggers24hResult = await q(
      `SELECT COUNT(*) AS count FROM alert_history
       WHERE workspace_id = $1 AND triggered_at > NOW() - INTERVAL '24 hours'`,
      [session.workspaceId]
    );

    const { tier, maxAlerts } = alertPlan(session);
    const activeCount = alerts.filter((a: any) => a.is_active).length;

    return NextResponse.json({
      alerts,
      quota: {
        used: activeCount,
        max: maxAlerts,
        tier,
        triggersToday: Number(triggers24hResult[0]?.count ?? 0) || 0,
      },
    });
  } catch (error) {
    console.error('Alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// POST - Create new alert
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: AlertPayload = await req.json();

    // Check if this is a multi-condition alert
    const isMultiCondition = body.isMultiCondition && body.conditions && body.conditions.length > 0;

    // Validate required fields
    if (!body.symbol) {
      return NextResponse.json(
        { error: 'Missing required field: symbol' },
        { status: 400 }
      );
    }

    // Multi-condition alerts are not evaluated by any alert checker yet (their rows can
    // mix RSI/MACD/moving-average/volume/OI/funding rules the checkers don't compute),
    // so they would sit "armed" forever without ever firing. Refuse to create them
    // rather than accept an alert that can never trigger.
    if (body.isMultiCondition || (body.conditionType as string) === 'multi') {
      return NextResponse.json(
        {
          error: 'Multi-condition alerts are not available yet',
          message: 'Multi-condition alerts are not checked yet, so they would never fire. Create single price or % change alerts instead.',
        },
        { status: 400 }
      );
    }

    // For single-condition alerts, require conditionType and conditionValue
    if (!isMultiCondition && (!body.conditionType || body.conditionValue === undefined)) {
      return NextResponse.json(
        { error: 'Missing required fields: conditionType, conditionValue' },
        { status: 400 }
      );
    }

    // For multi-condition alerts, validate conditions
    if (isMultiCondition) {
      for (const cond of body.conditions!) {
        if (!cond.conditionType || cond.conditionValue === undefined) {
          return NextResponse.json(
            { error: 'Each condition must have conditionType and conditionValue' },
            { status: 400 }
          );
        }
        if (!MULTI_CONDITION_TYPES.includes(cond.conditionType)) {
          return NextResponse.json(
            { error: `Invalid condition type: ${cond.conditionType}` },
            { status: 400 }
          );
        }
      }
    }

    // Check if this is a smart alert
    const isSmartAlert = SMART_ALERT_TYPES.includes(body.conditionType) || body.isSmartAlert;
    
    // Smart alerts and multi-condition alerts require Pro (legacy pro_trader and admins included)
    const { tier, maxAlerts } = alertPlan(session);
    if (isSmartAlert && tier !== 'pro') {
      return NextResponse.json(
        { 
          error: 'Smart alerts require Pro',
          message: 'Upgrade to Pro to create AI-powered smart alerts.',
        },
        { status: 403 }
      );
    }

    // Multi-condition alerts require Pro
    if (isMultiCondition && tier !== 'pro') {
      return NextResponse.json(
        { 
          error: 'Multi-condition alerts require Pro',
          message: 'Upgrade to Pro to create multi-condition alerts.',
        },
        { status: 403 }
      );
    }

    // Basic price / % change alerts must say which market the symbol is in, so the checker
    // prices it from the right feed (no silent crypto default; commodity alerts can't be
    // priced yet). Smart alerts keep their existing default.
    let assetType: string = body.assetType || 'crypto';
    if (!isSmartAlert) {
      const assetCheck = validateBasicAlertAssetType(body.assetType, body.conditionType, body.symbol);
      if (!assetCheck.ok) {
        return NextResponse.json({ error: assetCheck.error, message: assetCheck.message }, { status: 400 });
      }
      assetType = assetCheck.assetType;
    }

    // Check quota
    
    const activeResult = await q(
      `SELECT COUNT(*) as count FROM alerts WHERE workspace_id = $1 AND is_active = true`,
      [session.workspaceId]
    );
    const activeCount = parseInt(activeResult[0]?.count || '0');

    if (activeCount >= maxAlerts) {
      return NextResponse.json(
        { 
          error: 'Alert limit reached',
          message: `Your ${tier} plan allows ${maxAlerts} active alerts. Upgrade to create more.`,
          limit: maxAlerts,
          current: activeCount,
        },
        { status: 403 }
      );
    }

    // Generate alert name
    let alertName = body.name;
    if (!alertName) {
      if (isMultiCondition) {
        const condCount = body.conditions!.length;
        const logic = body.conditionLogic || 'AND';
        alertName = `${body.symbol} ${condCount} conditions (${logic})`;
      } else {
        alertName = `${body.symbol} ${body.conditionType.replace(/_/g, ' ')} ${body.conditionValue}`;
      }
    }

    // Insert alert
    const result = await q(
      `INSERT INTO alerts (
        workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_recurring, notify_email, notify_push, expires_at,
        is_smart_alert, cooldown_minutes, is_multi_condition, condition_logic, smart_alert_context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        session.workspaceId,
        body.symbol.toUpperCase(),
        assetType,
        isMultiCondition ? 'multi' : body.conditionType,
        isMultiCondition ? 0 : body.conditionValue,
        body.conditionTimeframe || null,
        alertName,
        body.notes || null,
        body.isRecurring ?? (isSmartAlert ? true : false),
        body.notifyEmail ?? true,
        body.notifyPush ?? true,
        body.expiresAt ? new Date(body.expiresAt) : null,
        isSmartAlert,
        body.cooldownMinutes || (isSmartAlert ? 60 : null),
        isMultiCondition,
        body.conditionLogic || 'AND',
        (body as any).smartAlertContext ? JSON.stringify((body as any).smartAlertContext) : null,
      ]
    );

    const alertId = result[0].id;

    // Insert conditions for multi-condition alerts
    if (isMultiCondition && body.conditions) {
      for (let i = 0; i < body.conditions.length; i++) {
        const cond = body.conditions[i];
        await q(
          `INSERT INTO alert_conditions (
            alert_id, condition_type, condition_value, condition_timeframe,
            condition_indicator, condition_period, condition_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            alertId,
            cond.conditionType,
            cond.conditionValue,
            cond.conditionTimeframe || null,
            cond.conditionIndicator || null,
            cond.conditionPeriod || null,
            i,
          ]
        );
      }

      // Fetch the conditions we just created
      const conditions = await q(
        `SELECT * FROM alert_conditions WHERE alert_id = $1 ORDER BY condition_order`,
        [alertId]
      );
      result[0].conditions = conditions;
    }

    // Update quota tracking
    await q(
      `INSERT INTO alert_quotas (workspace_id, tier, max_alerts, active_alerts)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (workspace_id) 
       DO UPDATE SET active_alerts = alert_quotas.active_alerts + 1, tier = $2`,
      [session.workspaceId, tier, maxAlerts]
    );

    return NextResponse.json({ 
      success: true, 
      alert: result[0],
      isSmartAlert,
      isMultiCondition,
      quota: {
        used: activeCount + 1,
        max: maxAlerts,
      }
    });
  } catch (error) {
    console.error('Alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}

// PUT - Update alert
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    // Build dynamic update query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'condition_value', 'name', 'notes', 'is_active', 'is_recurring',
      'notify_email', 'notify_push', 'expires_at'
    ];

    // Map camelCase to snake_case
    const fieldMap: Record<string, string> = {
      conditionValue: 'condition_value',
      isActive: 'is_active',
      isRecurring: 'is_recurring',
      notifyEmail: 'notify_email',
      notifyPush: 'notify_push',
      expiresAt: 'expires_at',
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField)) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(id, session.workspaceId);

    const result = await q(
      `UPDATE alerts 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND workspace_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (!result.length) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, alert: result[0] });
  } catch (error) {
    console.error('Alerts PUT error:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

// DELETE - Delete alert
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const bulk = url.searchParams.get('bulk');

    // Bulk cleanup: remove auto-generated orphaned alerts (condition_value = 0, workflow.auto source)
    if (bulk === 'auto-orphaned') {
      const deleted = await q(
        `DELETE FROM alerts
         WHERE workspace_id = $1
           AND is_smart_alert = true
           AND condition_value = 0
           AND smart_alert_context->>'source' = 'workflow.auto'
         RETURNING id`,
        [session.workspaceId]
      );
      const count = deleted.length;
      if (count > 0) {
        await q(
          `UPDATE alert_quotas SET active_alerts = GREATEST(0, active_alerts - $2) WHERE workspace_id = $1`,
          [session.workspaceId, count]
        );
      }
      return NextResponse.json({ success: true, deletedCount: count });
    }

    if (!id) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    // Delete alert (cascade will handle history)
    const result = await q(
      `DELETE FROM alerts WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, session.workspaceId]
    );

    if (!result.length) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    // Update quota
    await q(
      `UPDATE alert_quotas 
       SET active_alerts = GREATEST(0, active_alerts - 1)
       WHERE workspace_id = $1`,
      [session.workspaceId]
    );

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Alerts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 });
  }
}
