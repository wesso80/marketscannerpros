// =====================================================
// MSP AI ACTION EXECUTOR API - Execute AI tool calls
// POST /api/ai/actions
// Features: Idempotency, Dry Run, Audit Trail, Rate Limiting
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { AIToolName, ActionStatus, AIActionResult, PageSkill } from '@/lib/ai/types';
import { AI_TOOLS, assertToolAllowedForSkill, generateIdempotencyKey, getToolPolicy, isToolCacheable, getToolCacheTTL } from '@/lib/ai/tools';
import { buildPermissionSnapshot } from '@/lib/risk-governor-hard';
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';
import { runExecutionPipeline } from '@/lib/execution/runPipeline';

interface ActionRequest {
  tool: AIToolName;
  parameters: Record<string, unknown>;
  skill?: PageSkill;
  sessionId?: string;
  responseId?: string;
  idempotencyKey?: string;
  actionId?: string;
  confirm?: boolean;
  dryRun?: boolean;
  initiatedBy?: 'user' | 'ai';
}

async function ensureJournalRiskColumns() {
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8)`);
}

async function resolveActionSkill(
  workspaceId: string,
  requestedSkill?: PageSkill,
  responseId?: string
): Promise<PageSkill | null> {
  if (requestedSkill) return requestedSkill;

  if (responseId) {
    const rows = await q(
      `SELECT page_skill FROM ai_responses WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [responseId, workspaceId]
    );
    const fromResponse = rows[0]?.page_skill;
    if (typeof fromResponse === 'string') {
      return fromResponse as PageSkill;
    }
  }

  return null;
}

function validateToolParameters(
  tool: AIToolName,
  parameters: Record<string, unknown>
): { valid: true } | { valid: false; error: string } {
  const schema = AI_TOOLS[tool]?.parameters as {
    additionalProperties?: boolean;
    properties?: Record<string, { type?: string; enum?: unknown[]; required?: boolean; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; items?: { type?: string; minimum?: number; maximum?: number } }>;
    required?: string[];
  };

  if (!schema || typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
    return { valid: false, error: 'Invalid parameters payload' };
  }

  const allowedKeys = new Set(Object.keys(schema.properties || {}));
  const requiredKeys = schema.required || [];

  if (schema.additionalProperties === false) {
    const extra = Object.keys(parameters).find((key) => !allowedKeys.has(key));
    if (extra) return { valid: false, error: `Unknown parameter: ${extra}` };
  }

  for (const requiredKey of requiredKeys) {
    if (parameters[requiredKey] === undefined || parameters[requiredKey] === null) {
      return { valid: false, error: `Missing required parameter: ${requiredKey}` };
    }
  }

  for (const [name, rule] of Object.entries(schema.properties || {})) {
    const value = parameters[name];
    if (value === undefined || value === null) continue;

    if (rule.type === 'string') {
      if (typeof value !== 'string') return { valid: false, error: `Parameter ${name} must be a string` };
      if (rule.minLength !== undefined && value.length < rule.minLength) return { valid: false, error: `Parameter ${name} is too short` };
      if (rule.maxLength !== undefined && value.length > rule.maxLength) return { valid: false, error: `Parameter ${name} is too long` };
      if (rule.enum && !rule.enum.includes(value)) return { valid: false, error: `Parameter ${name} must be one of: ${rule.enum.join(', ')}` };
      if ((rule as { pattern?: string }).pattern) {
        const regex = new RegExp((rule as { pattern?: string }).pattern || '');
        if (!regex.test(value)) return { valid: false, error: `Parameter ${name} format is invalid` };
      }
    }

    if (rule.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) return { valid: false, error: `Parameter ${name} must be a number` };
      if (rule.minimum !== undefined && value < rule.minimum) return { valid: false, error: `Parameter ${name} must be >= ${rule.minimum}` };
      if (rule.maximum !== undefined && value > rule.maximum) return { valid: false, error: `Parameter ${name} must be <= ${rule.maximum}` };
    }

    if (rule.type === 'array') {
      if (!Array.isArray(value)) return { valid: false, error: `Parameter ${name} must be an array` };
      if (rule.minItems !== undefined && value.length < rule.minItems) return { valid: false, error: `Parameter ${name} requires at least ${rule.minItems} item(s)` };
      if (rule.maxItems !== undefined && value.length > rule.maxItems) return { valid: false, error: `Parameter ${name} exceeds ${rule.maxItems} items` };
      if (rule.items?.type === 'number') {
        const invalid = value.find((entry) => typeof entry !== 'number' || Number.isNaN(entry));
        if (invalid !== undefined) return { valid: false, error: `Parameter ${name} must contain only numbers` };
      }
      if (rule.items?.type === 'string') {
        const invalid = value.find((entry) => typeof entry !== 'string');
        if (invalid !== undefined) return { valid: false, error: `Parameter ${name} must contain only strings` };
      }
    }
  }

  return { valid: true };
}

function validateBusinessRules(
  tool: AIToolName,
  parameters: Record<string, unknown>
): { valid: true } | { valid: false; error: string } {
  if (tool === 'create_alert') {
    const alertType = parameters.alertType;
    const value = parameters.value;
    if (typeof value === 'number' && value <= 0 && (alertType === 'price_above' || alertType === 'price_below')) {
      return { valid: false, error: 'Price alert value must be positive' };
    }
    if (typeof value === 'number' && (alertType === 'rsi_overbought' || alertType === 'rsi_oversold') && (value < 0 || value > 100)) {
      return { valid: false, error: 'RSI alert value must be between 0 and 100' };
    }
  }

  if (tool === 'risk_position_size') {
    const accountSize = parameters.accountSize;
    const riskPercent = parameters.riskPercent;
    const entryPrice = parameters.entryPrice;
    const stopLoss = parameters.stopLoss;
    if ([accountSize, riskPercent, entryPrice, stopLoss].some((value) => typeof value !== 'number')) {
      return { valid: false, error: 'accountSize, riskPercent, entryPrice, and stopLoss are required numbers' };
    }
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ActionRequest = await req.json();
    const {
      tool,
      parameters,
      skill: requestedSkill,
      sessionId,
      responseId,
      actionId,
      confirm = false,
      dryRun = false,
      initiatedBy = 'user',
    } = body;

    if (!tool || !parameters || typeof parameters !== 'object') {
      return NextResponse.json({ error: 'Tool name and parameters are required' }, { status: 400 });
    }

    const policy = getToolPolicy(tool);
    if (!policy) {
      return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
    }

    const resolvedSkill = await resolveActionSkill(session.workspaceId, requestedSkill, responseId);
    if (!resolvedSkill) {
      return NextResponse.json({ error: 'Skill context required for tool execution' }, { status: 400 });
    }

    try {
      assertToolAllowedForSkill(tool, resolvedSkill);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Tool not allowed for skill' }, { status: 403 });
    }

    const schemaValidation = validateToolParameters(tool, parameters);
    if (!schemaValidation.valid) {
      return NextResponse.json({ error: schemaValidation.error }, { status: 400 });
    }

    const businessValidation = validateBusinessRules(tool, parameters);
    if (!businessValidation.valid) {
      return NextResponse.json({ error: businessValidation.error }, { status: 400 });
    }

    const idempotencyKey = body.idempotencyKey || generateIdempotencyKey(
      session.workspaceId,
      tool,
      parameters,
      resolvedSkill,
      sessionId
    );

    let pendingActionId: string | null = actionId || null;

    const existingAction = await q(
      `SELECT id, status, result_data, error_message
       FROM ai_actions
       WHERE workspace_id = $1 AND idempotency_key = $2 AND status IN ('executed', 'pending', 'confirmed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [session.workspaceId, idempotencyKey]
    );

    if (existingAction.length > 0) {
      const existing = existingAction[0];
      pendingActionId = existing.id;

      if (existing.status === 'executed') {
        return NextResponse.json({
          success: true,
          actionId: existing.id,
          idempotencyKey,
          status: existing.status as ActionStatus,
          duplicate: true,
          executedResult: existing.result_data,
          error: existing.error_message,
          message: 'Action already processed (idempotent)',
        });
      }

      if ((existing.status === 'pending' || existing.status === 'confirmed') && !confirm && !dryRun) {
        return NextResponse.json({
          success: true,
          actionId: existing.id,
          idempotencyKey,
          status: existing.status as ActionStatus,
          requiresConfirmation: policy.requiresConfirmation,
          message: 'Action already pending confirmation',
        });
      }
    }

    if (!dryRun && !confirm && policy.sideEffect === 'read' && isToolCacheable(tool)) {
      const ttlSeconds = getToolCacheTTL(tool);
      if (ttlSeconds > 0) {
        const cachedRows = await q(
          `SELECT id, result_data
           FROM ai_actions
           WHERE workspace_id = $1
             AND action_type = $2
             AND action_params = $3::jsonb
             AND status = 'executed'
             AND success = true
             AND created_at > NOW() - ($4::TEXT || ' seconds')::INTERVAL
           ORDER BY created_at DESC
           LIMIT 1`,
          [session.workspaceId, tool, JSON.stringify(parameters), ttlSeconds]
        );

        if (cachedRows.length > 0) {
          return NextResponse.json({
            success: true,
            actionId: cachedRows[0].id,
            idempotencyKey,
            status: 'executed' as ActionStatus,
            cached: true,
            executedResult: cachedRows[0].result_data,
          });
        }
      }
    }

    const rateLimitResult = await q(
      `SELECT * FROM increment_rate_limit($1, $2, 0)`,
      [session.workspaceId, tool]
    );

    if (rateLimitResult.length > 0) {
      const { minute_count, hour_count } = rateLimitResult[0];
      if (minute_count > policy.rateLimitPerMinute || hour_count > policy.rateLimitPerHour) {
        return NextResponse.json({
          error: 'Rate limit exceeded',
          retryAfter: minute_count > policy.rateLimitPerMinute ? 60 : 3600,
        }, { status: 429 });
      }
    }

    if (policy.requiresConfirmation && !dryRun && !confirm) {
      const dryRunResult = await simulateAction(tool, parameters);

      const pendingInsert = await q(
        `INSERT INTO ai_actions
         (workspace_id, response_id, action_type, action_params, idempotency_key, initiated_by,
          status, dry_run, dry_run_result, required_confirmation, user_confirmed, tool_cost_level, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', true, $7, true, false, $8, $9)
         ON CONFLICT (workspace_id, idempotency_key)
         DO UPDATE SET
           status = CASE WHEN ai_actions.status = 'executed' THEN ai_actions.status ELSE 'pending' END,
           dry_run_result = EXCLUDED.dry_run_result
         RETURNING id, status`,
        [
          session.workspaceId,
          responseId || null,
          tool,
          JSON.stringify(parameters),
          idempotencyKey,
          initiatedBy,
          JSON.stringify(dryRunResult),
          policy.costLevel,
          Date.now() - startTime,
        ]
      );

      return NextResponse.json({
        success: true,
        actionId: pendingInsert[0]?.id,
        idempotencyKey,
        status: pendingInsert[0]?.status || 'pending',
        requiresConfirmation: true,
        dryRun: true,
        dryRunResult,
        message: 'Action pending confirmation',
      });
    }

    if (confirm && policy.requiresConfirmation && pendingActionId) {
      await q(
        `UPDATE ai_actions
         SET status = 'confirmed', user_confirmed = true, confirmed_at = NOW()
         WHERE id = $1 AND workspace_id = $2`,
        [pendingActionId, session.workspaceId]
      );
    }

    // Execute the action
    let result: { success: boolean; data?: unknown; error?: string };

    switch (tool) {
      case 'create_alert':
        result = await executeCreateAlert(session.workspaceId, parameters);
        break;
      case 'add_to_watchlist':
        result = await executeAddToWatchlist(session.workspaceId, parameters);
        break;
      case 'remove_from_watchlist':
        result = await executeRemoveFromWatchlist(session.workspaceId, parameters);
        break;
      case 'journal_trade':
        result = await executeJournalTrade(session.workspaceId, parameters);
        break;
      case 'risk_position_size':
        result = executePositionSize(parameters);
        break;
      case 'generate_trade_plan':
        result = generateTradePlan(parameters);
        break;
      default:
        result = { success: false, error: 'Unknown tool' };
    }

    const executionTime = Date.now() - startTime;
    const status: ActionStatus = result.success ? 'executed' : 'failed';

    let finalActionId: string | null = pendingActionId;

    if (pendingActionId) {
      const updated = await q(
        `UPDATE ai_actions
         SET success = $3,
             status = $4,
             result_data = $5,
             error_message = $6,
             error_code = $7,
             required_confirmation = $8,
             tool_cost_level = $9,
             execution_time_ms = $10,
             user_confirmed = CASE WHEN $8 THEN true ELSE user_confirmed END,
             confirmed_at = CASE WHEN $8 THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END
         WHERE id = $1 AND workspace_id = $2
         RETURNING id`,
        [
          pendingActionId,
          session.workspaceId,
          result.success,
          status,
          JSON.stringify(result.data || {}),
          result.error || null,
          result.success ? null : 'EXECUTION_ERROR',
          policy.requiresConfirmation,
          policy.costLevel,
          executionTime,
        ]
      );
      finalActionId = updated[0]?.id || pendingActionId;
    } else {
      const actionResult = await q(
        `INSERT INTO ai_actions 
         (workspace_id, response_id, action_type, action_params, idempotency_key, initiated_by,
          success, status, result_data, error_message, error_code,
          user_confirmed, confirmed_at, required_confirmation, tool_cost_level, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $12 THEN NOW() ELSE NULL END, $13, $14, $15)
         RETURNING id`,
        [
          session.workspaceId,
          responseId || null,
          tool,
          JSON.stringify(parameters),
          idempotencyKey,
          initiatedBy,
          result.success,
          status,
          JSON.stringify(result.data || {}),
          result.error || null,
          result.success ? null : 'EXECUTION_ERROR',
          confirm || !policy.requiresConfirmation,
          policy.requiresConfirmation,
          policy.costLevel,
          executionTime,
        ]
      );
      finalActionId = actionResult[0]?.id || null;
    }

    // Update response record if action was taken
    if (responseId && result.success) {
      await q(
        `UPDATE ai_responses SET user_took_action = true, action_type = $2 WHERE id = $1`,
        [responseId, tool]
      );
    }

    // Log event with learning signal
    await q(
      `INSERT INTO ai_events 
       (workspace_id, event_type, event_data, label_type, label_strength, label_signal)
       VALUES ($1, 'ai_action_used', $2, 'implicit', $3, $4)`,
      [
        session.workspaceId, 
        JSON.stringify({ tool, success: result.success, executionTime }),
        result.success ? 'strong' : 'medium',
        result.success ? 'positive' : 'negative',
      ]
    );

    const response: AIActionResult = {
      actionId: finalActionId || '',
      idempotencyKey,
      status,
      requiresConfirmation: policy.requiresConfirmation,
      executedResult: result.data,
      error: result.error,
    };

    if (!result.success) {
      return NextResponse.json({ ...response, success: false }, { status: 400 });
    }

    return NextResponse.json({ ...response, success: true });

  } catch (error) {
    console.error('Error executing AI action:', error);
    return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
  }
}

// GET endpoint to check action status
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const actionId = searchParams.get('actionId');
    const idempotencyKey = searchParams.get('idempotencyKey');

    if (!actionId && !idempotencyKey) {
      return NextResponse.json({ error: 'actionId or idempotencyKey required' }, { status: 400 });
    }

    const query = actionId 
      ? `SELECT * FROM ai_actions WHERE id = $1 AND workspace_id = $2`
      : `SELECT * FROM ai_actions WHERE idempotency_key = $1 AND workspace_id = $2`;
    
    const result = await q(query, [actionId || idempotencyKey, session.workspaceId]);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, action: result[0] });
  } catch (error) {
    console.error('Error fetching action:', error);
    return NextResponse.json({ error: 'Failed to fetch action' }, { status: 500 });
  }
}

// ===== DRY RUN SIMULATION =====

async function simulateAction(
  tool: AIToolName,
  parameters: Record<string, unknown>
): Promise<{ wouldDo: string; wouldAffect: string[]; reversible: boolean }> {
  switch (tool) {
    case 'create_alert':
      return {
        wouldDo: `Create ${parameters.alertType} alert for ${parameters.symbol} at ${parameters.value}`,
        wouldAffect: ['user_alerts table', 'notification queue'],
        reversible: true,
      };
    case 'add_to_watchlist':
      return {
        wouldDo: `Add ${parameters.symbol} to watchlist with priority ${parameters.priority || 'medium'}`,
        wouldAffect: ['user_watchlist table'],
        reversible: true,
      };
    case 'remove_from_watchlist':
      return {
        wouldDo: `Remove ${parameters.symbol} from watchlist`,
        wouldAffect: ['user_watchlist table'],
        reversible: true,
      };
    case 'journal_trade':
      return {
        wouldDo: `Create journal entry for ${parameters.direction} ${parameters.symbol}`,
        wouldAffect: ['journal_entries table'],
        reversible: true,
      };
    case 'run_backtest':
      return {
        wouldDo: `Run backtest for ${parameters.symbol} from ${parameters.startDate} to ${parameters.endDate}`,
        wouldAffect: ['Compute resources (high cost)'],
        reversible: false, // Results are generated, not stored
      };
    default:
      return {
        wouldDo: `Execute ${tool} with given parameters`,
        wouldAffect: ['Varies by tool'],
        reversible: true,
      };
  }
}

// ===== TOOL EXECUTORS =====

async function executeCreateAlert(
  workspaceId: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const { symbol, alertType, value, note } = params;

    if (!symbol || !alertType || value === undefined) {
      return { success: false, error: 'Symbol, alertType, and value are required' };
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return { success: false, error: 'Alert value must be numeric' };
    }

    if ((alertType === 'price_above' || alertType === 'price_below') && numericValue <= 0) {
      return { success: false, error: 'Price alert value must be positive' };
    }

    if ((alertType === 'rsi_overbought' || alertType === 'rsi_oversold') && (numericValue < 0 || numericValue > 100)) {
      return { success: false, error: 'RSI alert value must be between 0 and 100' };
    }

    // Insert into alerts table
    const result = await q(
      `INSERT INTO user_alerts (workspace_id, symbol, alert_type, target_value, note, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING id`,
      [workspaceId, symbol, alertType, numericValue, typeof note === 'string' ? note.slice(0, 280) : null]
    );

    return {
      success: true,
      data: {
        alertId: result[0]?.id,
        message: `Alert created: ${alertType} for ${symbol} at ${value}`,
      },
    };
  } catch (error) {
    console.error('Create alert error:', error);
    return { success: false, error: 'Failed to create alert' };
  }
}

async function executeAddToWatchlist(
  workspaceId: string, 
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const { symbol, note, priority } = params;
    
    if (!symbol) {
      return { success: false, error: 'Symbol required' };
    }

    const watchlistCount = await q(
      `SELECT COUNT(*)::INT AS count FROM user_watchlist WHERE workspace_id = $1`,
      [workspaceId]
    );
    const currentCount = watchlistCount[0]?.count || 0;
    const maxWatchlistSize = 250;
    if (currentCount >= maxWatchlistSize) {
      return { success: false, error: `Watchlist limit reached (${maxWatchlistSize})` };
    }

    const sanitizedNote = typeof note === 'string' ? note.slice(0, 280) : null;

    // Upsert into watchlist
    await q(
      `INSERT INTO user_watchlist (workspace_id, symbol, note, priority, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (workspace_id, symbol) 
       DO UPDATE SET note = COALESCE($3, user_watchlist.note), priority = COALESCE($4, user_watchlist.priority), updated_at = NOW()`,
      [workspaceId, (symbol as string).toUpperCase(), sanitizedNote, priority || 'medium']
    );

    return { 
      success: true, 
      data: { message: `${symbol} added to watchlist` }
    };
  } catch (error) {
    console.error('Add to watchlist error:', error);
    return { success: false, error: 'Failed to add to watchlist' };
  }
}

async function executeRemoveFromWatchlist(
  workspaceId: string, 
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const { symbol } = params;
    
    if (!symbol) {
      return { success: false, error: 'Symbol required' };
    }

    await q(
      `DELETE FROM user_watchlist WHERE workspace_id = $1 AND symbol = $2`,
      [workspaceId, (symbol as string).toUpperCase()]
    );

    return { 
      success: true, 
      data: { message: `${symbol} removed from watchlist` }
    };
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    return { success: false, error: 'Failed to remove from watchlist' };
  }
}

async function executeJournalTrade(
  workspaceId: string, 
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    await ensureJournalRiskColumns();

    const { 
      symbol, 
      direction, 
      entryPrice, 
      exitPrice, 
      setupType, 
      notes, 
      mistakes, 
      lessons 
    } = params;
    
    if (!symbol || !direction) {
      return { success: false, error: 'Symbol and direction required' };
    }

    const safeSymbol = (symbol as string).toUpperCase();
    const side = String(direction).toUpperCase().includes('SHORT') || String(direction).toUpperCase().includes('SELL')
      ? 'SHORT' as const : 'LONG' as const;
    const safePriceRaw = Number(entryPrice);
    const safePrice = Number.isFinite(safePriceRaw) && safePriceRaw > 0 ? safePriceRaw : 0;

    // Infer asset class from symbol
    const inferredAssetClass = safeSymbol.endsWith('USD') || safeSymbol.endsWith('USDT')
      ? 'crypto' as const : 'equity' as const;

    // Run execution pipeline for stops, targets, sizing
    if (safePrice > 0) {
      const pipeline = await runExecutionPipeline({
        workspaceId,
        symbol: safeSymbol,
        side,
        entryPrice: safePrice,
        assetClass: inferredAssetClass,
        confidence: 50,
        regime: 'Trend',
        strategyTag: 'alert_intelligence',
        atr: null,
        guardEnabled: true,
      });

      if (pipeline.ok) {
        const { exits, sizing, leverage: leverageResult, entryRisk } = pipeline.result;
        const engineNotes = [
          notes || 'AI-initiated trade with execution engine.',
          '',
          `EXECUTION ENGINE: Stop ${exits.stop_price} | TP1 ${exits.take_profit_1} | R:R ${exits.rr_at_tp1}:1`,
        ].join('\n');

        const result = await q(
          `INSERT INTO journal_entries (
            workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
            stop_loss, target, risk_amount, planned_rr,
            strategy, setup, notes, emotions, outcome, tags, is_open, asset_class,
            normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry,
            leverage, execution_mode, trail_rule, time_stop_minutes, take_profit_2,
            created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27, $28,
            NOW()
          )
          RETURNING id`,
          [
            workspaceId,
            new Date().toISOString().slice(0, 10),
            safeSymbol,
            side,
            pipeline.result.tradeType,
            sizing.quantity,
            safePrice,
            exits.stop_price,
            exits.take_profit_1,
            sizing.total_risk_usd,
            exits.rr_at_tp1,
            String(setupType || 'ai_trade'),
            'ai_chatbot',
            engineNotes,
            '',
            'open',
            ['ai_trade', 'execution_engine', 'paper_trade'],
            true,
            inferredAssetClass,
            entryRisk.normalizedR,
            entryRisk.dynamicR,
            entryRisk.riskPerTradeAtEntry,
            entryRisk.equityAtEntry,
            leverageResult.recommended_leverage,
            'PAPER',
            exits.trail_rule,
            exits.time_stop_minutes,
            exits.take_profit_2,
          ]
        );

        return {
          success: true,
          data: {
            entryId: result[0]?.id,
            message: `Journal entry created for ${safeSymbol} ${side} with execution engine (stop: ${exits.stop_price}, tp1: ${exits.take_profit_1})`,
          },
        };
      }
      // Pipeline rejected — fall through to basic insert
      console.warn(`[ai/actions] Execution pipeline rejected ${safeSymbol}: ${pipeline.reason}`);
    }

    // Fallback: basic insert without execution engine
    const snapshot = buildPermissionSnapshot({ enabled: true });
    const equityAtEntry = await getLatestPortfolioEquity(workspaceId);
    const entryRisk = computeEntryRiskMetrics({
      dynamicRiskPerTrade: snapshot.caps.risk_per_trade,
      equityAtEntry,
    });

    const result = await q(
      `INSERT INTO journal_entries 
       (workspace_id, symbol, side, entry_price, exit_price, setup_type, notes, mistakes, lessons, 
        normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry, asset_class, execution_mode, 
        outcome, is_open, tags, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       RETURNING id`,
      [
        workspaceId,
        safeSymbol,
        side,
        safePrice > 0 ? safePrice : null,
        exitPrice || null,
        setupType || 'other',
        notes || null,
        mistakes ? JSON.stringify(mistakes) : null,
        lessons || null,
        entryRisk.normalizedR,
        entryRisk.dynamicR,
        entryRisk.riskPerTradeAtEntry,
        entryRisk.equityAtEntry,
        inferredAssetClass,
        'DRY_RUN',
        'open',
        true,
        ['ai_trade', 'missing_execution_engine'],
      ]
    );

    return { 
      success: true, 
      data: { 
        entryId: result[0]?.id,
        message: `Journal entry created for ${safeSymbol} ${side} (no execution engine — ATR unavailable)`
      }
    };
  } catch (error) {
    console.error('Journal trade error:', error);
    return { success: false, error: 'Failed to create journal entry' };
  }
}

function executePositionSize(
  params: Record<string, unknown>
): { success: boolean; data?: unknown; error?: string } {
  const { accountSize, riskPercent, entryPrice, stopLoss, symbol } = params;

  if (accountSize === undefined || riskPercent === undefined || entryPrice === undefined || stopLoss === undefined) {
    return { success: false, error: 'accountSize, riskPercent, entryPrice, and stopLoss are required' };
  }

  const entry = Number(entryPrice);
  const stop = Number(stopLoss);
  const account = Number(accountSize);
  const risk = Number(riskPercent);

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(account) || !Number.isFinite(risk)) {
    return { success: false, error: 'Position size inputs must be numeric' };
  }
  if (entry <= 0 || stop < 0 || account <= 0 || risk <= 0 || risk > 100) {
    return { success: false, error: 'Invalid risk or price inputs' };
  }
  if (entry === stop) {
    return { success: false, error: 'Entry and stop cannot be equal' };
  }

  const riskPerShare = Math.abs(entry - stop);
  const dollarRisk = account * (risk / 100);
  const shares = Math.floor(dollarRisk / riskPerShare);
  const positionValue = shares * entry;
  const positionPercent = (positionValue / account) * 100;

  return {
    success: true,
    data: {
      symbol: symbol || 'N/A',
      accountSize: account,
      riskPercent: risk,
      dollarRisk: dollarRisk.toFixed(2),
      entryPrice: entry,
      stopLoss: stop,
      riskPerShare: riskPerShare.toFixed(4),
      recommendedShares: shares,
      positionValue: positionValue.toFixed(2),
      positionPercent: positionPercent.toFixed(2),
      message: `Risk $${dollarRisk.toFixed(0)} on ${shares} shares = $${positionValue.toFixed(0)} position (${positionPercent.toFixed(1)}% of account)`,
    },
  };
}

function generateTradePlan(
  params: Record<string, unknown>
): { success: boolean; data?: unknown; error?: string } {
  const { symbol, direction, entryPrice, stopLoss, targets, timeframe, thesis } = params;

  if (!symbol || !direction) {
    return { success: false, error: 'Symbol and direction required' };
  }

  const entry = Number(entryPrice) || 0;
  const stop = Number(stopLoss) || 0;
  const targetList = (targets as number[]) || [];

  const riskPercent = entry && stop ? ((Math.abs(entry - stop) / entry) * 100).toFixed(2) : 'N/A';
  
  const rewardRatios = targetList.map((target, i) => {
    if (!entry || !stop) return 'N/A';
    const reward = Math.abs(target - entry);
    const risk = Math.abs(entry - stop);
    return `T${i + 1}: ${(reward / risk).toFixed(2)}R`;
  });

  const plan = {
    symbol: (symbol as string).toUpperCase(),
    direction,
    timeframe: timeframe || 'swing',
    entry: entry || 'TBD',
    stopLoss: stop || 'TBD',
    riskPercent,
    targets: targetList.length > 0 ? targetList : ['TBD'],
    rewardRatios,
    thesis: thesis || 'No thesis provided',
    invalidation: `Trade invalid if price moves beyond ${stop}`,
    rules: [
      `Risk no more than 1-2% of account`,
      `Wait for entry confirmation before sizing`,
      `Scale out at targets, don't move stops to breakeven too early`,
    ],
  };

  return {
    success: true,
    data: plan,
  };
}
