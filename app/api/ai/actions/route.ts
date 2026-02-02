// =====================================================
// MSP AI ACTION EXECUTOR API - Execute AI tool calls
// POST /api/ai/actions
// Features: Idempotency, Dry Run, Audit Trail, Rate Limiting
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { AIToolName, ActionStatus, AIActionResult } from '@/lib/ai/types';
import { AI_TOOLS, generateIdempotencyKey, getToolPolicy } from '@/lib/ai/tools';

interface ActionRequest {
  tool: AIToolName;
  parameters: Record<string, unknown>;
  responseId?: string;
  idempotencyKey?: string;
  dryRun?: boolean;
  initiatedBy?: 'user' | 'ai';
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
      responseId,
      dryRun = false,
      initiatedBy = 'user'
    } = body;

    if (!tool) {
      return NextResponse.json({ error: 'Tool name required' }, { status: 400 });
    }

    // Get tool policy
    const policy = getToolPolicy(tool);
    if (!policy) {
      return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
    }

    // Generate idempotency key if not provided
    const idempotencyKey = body.idempotencyKey || generateIdempotencyKey(
      session.workspaceId,
      tool,
      parameters
    );

    // Check for existing action with same idempotency key (prevent duplicates)
    const existingAction = await q(
      `SELECT id, status, result_data, error_message FROM ai_actions 
       WHERE workspace_id = $1 AND idempotency_key = $2 AND status IN ('executed', 'pending')`,
      [session.workspaceId, idempotencyKey]
    );

    if (existingAction.length > 0) {
      const existing = existingAction[0];
      return NextResponse.json({
        success: existing.status === 'executed',
        actionId: existing.id,
        idempotencyKey,
        status: existing.status as ActionStatus,
        duplicate: true,
        data: existing.result_data,
        error: existing.error_message,
        message: 'Action already processed (idempotent)',
      });
    }

    // Check rate limits
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

    // If dry run, simulate the action without executing
    if (dryRun) {
      const dryRunResult = await simulateAction(tool, parameters);
      
      // Log dry run for audit
      await q(
        `INSERT INTO ai_actions 
         (workspace_id, response_id, action_type, action_params, idempotency_key, initiated_by, 
          status, dry_run, dry_run_result, tool_cost_level, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', true, $7, $8, $9)
         RETURNING id`,
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
        idempotencyKey,
        status: 'pending' as ActionStatus,
        requiresConfirmation: policy.requiresConfirmation,
        dryRun: true,
        dryRunResult,
        message: 'Dry run complete. Confirm to execute.',
      });
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

    // Log the action with full audit trail
    const actionResult = await q(
      `INSERT INTO ai_actions 
       (workspace_id, response_id, action_type, action_params, idempotency_key, initiated_by,
        success, status, result_data, error_message, error_code, 
        user_confirmed, confirmed_at, required_confirmation, tool_cost_level, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), $12, $13, $14)
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
        policy.requiresConfirmation,
        policy.costLevel,
        executionTime,
      ]
    );

    const actionId = actionResult[0]?.id;

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
      actionId,
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

    // Insert into alerts table
    const result = await q(
      `INSERT INTO user_alerts (workspace_id, symbol, alert_type, target_value, note, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING id`,
      [workspaceId, symbol, alertType, value, note || null]
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

    // Upsert into watchlist
    await q(
      `INSERT INTO user_watchlist (workspace_id, symbol, note, priority, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (workspace_id, symbol) 
       DO UPDATE SET note = COALESCE($3, user_watchlist.note), priority = COALESCE($4, user_watchlist.priority), updated_at = NOW()`,
      [workspaceId, (symbol as string).toUpperCase(), note || null, priority || 'medium']
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

    const result = await q(
      `INSERT INTO journal_entries 
       (workspace_id, symbol, side, entry_price, exit_price, setup_type, notes, mistakes, lessons, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        workspaceId,
        (symbol as string).toUpperCase(),
        direction,
        entryPrice || null,
        exitPrice || null,
        setupType || 'other',
        notes || null,
        mistakes ? JSON.stringify(mistakes) : null,
        lessons || null,
      ]
    );

    return { 
      success: true, 
      data: { 
        entryId: result[0]?.id,
        message: `Journal entry created for ${symbol} ${direction}`
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

  if (!entryPrice || !stopLoss) {
    return { success: false, error: 'Entry and stop loss prices required' };
  }

  const entry = Number(entryPrice);
  const stop = Number(stopLoss);
  const account = Number(accountSize) || 10000;
  const risk = Number(riskPercent) || 1;

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
