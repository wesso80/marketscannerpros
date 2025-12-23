import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * Price Alerts API
 * 
 * GET - List all alerts for workspace
 * POST - Create new alert
 * PUT - Update existing alert
 * DELETE - Delete alert
 */

// Alert limits by tier
const ALERT_LIMITS = {
  free: 3,
  pro: 25,
  pro_trader: 999, // effectively unlimited
};

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
}

// Smart alert condition types (Pro Trader only)
const SMART_ALERT_TYPES = [
  'oi_surge', 'oi_drop',
  'funding_extreme_pos', 'funding_extreme_neg',
  'ls_ratio_high', 'ls_ratio_low',
  'fear_extreme', 'greed_extreme',
  'oi_divergence_bull', 'oi_divergence_bear',
];

// GET - List all alerts
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === 'true';
    const symbol = url.searchParams.get('symbol');
    const smartOnly = url.searchParams.get('smart') === 'true';
    
    let query = `
      SELECT 
        id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_active, is_recurring, notify_email, notify_push,
        triggered_at, trigger_count, last_price, created_at, updated_at, expires_at,
        is_smart_alert, smart_alert_context, last_derivative_value, cooldown_minutes
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

    query += ` ORDER BY created_at DESC`;

    const alerts = await q(query, params);

    // Get quota info
    const quotaResult = await q(
      `SELECT max_alerts, active_alerts, total_triggers_today FROM alert_quotas WHERE workspace_id = $1`,
      [session.workspaceId]
    );

    const tier = session.tier || 'free';
    const maxAlerts = ALERT_LIMITS[tier as keyof typeof ALERT_LIMITS] || 3;
    const activeCount = alerts.filter((a: any) => a.is_active).length;

    return NextResponse.json({
      alerts,
      quota: {
        used: activeCount,
        max: maxAlerts,
        tier,
        triggersToday: quotaResult[0]?.total_triggers_today || 0,
      },
    });
  } catch (error) {
    console.error('Alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// POST - Create new alert
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: AlertPayload = await req.json();

    // Validate required fields
    if (!body.symbol || !body.conditionType || body.conditionValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, conditionType, conditionValue' },
        { status: 400 }
      );
    }

    // Check if this is a smart alert
    const isSmartAlert = SMART_ALERT_TYPES.includes(body.conditionType) || body.isSmartAlert;
    
    // Smart alerts require Pro Trader
    const tier = session.tier || 'free';
    if (isSmartAlert && tier !== 'pro_trader') {
      return NextResponse.json(
        { 
          error: 'Smart alerts require Pro Trader',
          message: 'Upgrade to Pro Trader to create AI-powered smart alerts.',
        },
        { status: 403 }
      );
    }

    // Check quota
    const maxAlerts = ALERT_LIMITS[tier as keyof typeof ALERT_LIMITS] || 3;
    
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

    // Insert alert
    const result = await q(
      `INSERT INTO alerts (
        workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_recurring, notify_email, notify_push, expires_at,
        is_smart_alert, cooldown_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        session.workspaceId,
        body.symbol.toUpperCase(),
        body.assetType || 'crypto',
        body.conditionType,
        body.conditionValue,
        body.conditionTimeframe || null,
        body.name || `${body.symbol} ${body.conditionType.replace(/_/g, ' ')} ${body.conditionValue}`,
        body.notes || null,
        body.isRecurring ?? (isSmartAlert ? true : false), // Smart alerts default to recurring
        body.notifyEmail ?? true,
        body.notifyPush ?? true,
        body.expiresAt ? new Date(body.expiresAt) : null,
        isSmartAlert,
        body.cooldownMinutes || (isSmartAlert ? 60 : null), // Default 1hr cooldown for smart alerts
      ]
    );

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
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

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
