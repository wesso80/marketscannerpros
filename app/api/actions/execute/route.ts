import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getRiskGovernorThresholdsFromEnv } from '@/lib/operator/riskGovernor';
import { buildPermissionSnapshot, evaluateCandidate, type StrategyTag } from '@/lib/risk-governor-hard';
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';
import { getRuntimeRiskSnapshotInput } from '@/lib/risk/runtimeSnapshot';
import { runExecutionPipeline } from '@/lib/execution/runPipeline';

type CanonicalActionType =
  | 'alert.create'
  | 'plan.create'
  | 'journal.open'
  | 'trade.close'
  | 'focus.pin'
  | 'focus.snooze'
  | 'watchlist.add'
  | 'notify.send'
  | 'order.export';

type LegacyActionType =
  | 'create_alert'
  | 'create_journal_draft'
  | 'create_plan_draft'
  | 'trade.close';

type ExecuteMode = 'draft' | 'assist';

type ExecuteActionPayload = {
  idempotencyKey?: string;
  proposalId?: string;
  decisionPacketId?: string;
  source?: string;
  actionType?: CanonicalActionType | LegacyActionType;
  mode?: ExecuteMode | 'commit';
  params?: Record<string, any>;
  action?: {
    type?: CanonicalActionType | LegacyActionType;
    mode?: ExecuteMode | 'commit';
    payload?: Record<string, any>;
  };
};

const ASSIST_EXECUTE_WHITELIST = new Set<CanonicalActionType>([
  'alert.create',
  'plan.create',
  'journal.open',
  'trade.close',
  'focus.pin',
  'focus.snooze',
  'watchlist.add',
  'notify.send',
  'order.export',
]);

function mapToCanonicalActionType(input: unknown): CanonicalActionType | null {
  const value = String(input || '').trim();
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (normalized === 'alert.create' || normalized === 'create_alert') return 'alert.create';
  if (normalized === 'plan.create' || normalized === 'create_plan_draft') return 'plan.create';
  if (normalized === 'journal.open' || normalized === 'create_journal_draft') return 'journal.open';
  if (normalized === 'trade.close') return 'trade.close';
  if (normalized === 'focus.pin') return 'focus.pin';
  if (normalized === 'focus.snooze') return 'focus.snooze';
  if (normalized === 'watchlist.add') return 'watchlist.add';
  if (normalized === 'notify.send') return 'notify.send';
  if (normalized === 'order.export') return 'order.export';
  return null;
}

function mapToLegacyActionType(actionType: CanonicalActionType): LegacyActionType {
  if (actionType === 'alert.create') return 'create_alert';
  if (actionType === 'plan.create') return 'create_plan_draft';
  if (actionType === 'journal.open') return 'create_journal_draft';
  return 'trade.close';
}

function normalizeMode(input: unknown): ExecuteMode {
  const value = String(input || '').toLowerCase();
  return value === 'assist' ? 'assist' : 'draft';
}

async function ensureActionTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS operator_action_executions (
      id BIGSERIAL PRIMARY KEY,
      workspace_id UUID NOT NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      proposal_id VARCHAR(160),
      action_type VARCHAR(80) NOT NULL,
      source VARCHAR(80),
      mode VARCHAR(16) NOT NULL DEFAULT 'draft',
      status VARCHAR(20) NOT NULL DEFAULT 'processing',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, idempotency_key)
    )
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_operator_action_executions_workspace_created
    ON operator_action_executions (workspace_id, created_at DESC)
  `);
}

async function ensureJournalRiskColumns() {
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6)`);
  await q(`ALTER TABLE IF EXISTS journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8)`);
}

function asUpper(value: unknown, maxLen = 24): string {
  return String(value || '').trim().toUpperCase().slice(0, maxLen);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex' || normalized === 'fx') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

function inferAssetClassFromSymbol(symbol: string): 'crypto' | 'equity' {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USD') || upper.endsWith('USDT')) return 'crypto';
  return 'equity';
}

function mapPayloadStrategyTag(value: unknown): StrategyTag {
  const text = String(value || '').toLowerCase();
  if (text.includes('breakout')) return 'BREAKOUT_CONTINUATION';
  if (text.includes('pullback') || text.includes('trend')) return 'TREND_PULLBACK';
  if (text.includes('range') || text.includes('fade')) return 'RANGE_FADE';
  if (text.includes('mean') || text.includes('reversion') || text.includes('reclaim')) return 'MEAN_REVERSION';
  if (text.includes('event') || text.includes('earnings') || text.includes('cpi') || text.includes('fomc')) return 'EVENT_STRATEGY';
  return 'MOMENTUM_REVERSAL';
}

function createIdempotencyFallback(workspaceId: string, actionType: string, payload: Record<string, any>) {
  return createHash('sha256')
    .update(JSON.stringify({ workspaceId, actionType, payload }))
    .digest('hex')
    .slice(0, 64);
}

async function evaluateAssistGate(workspaceId: string, actionType: CanonicalActionType): Promise<{ allowed: boolean; reason: string | null }> {
  if (!ASSIST_EXECUTE_WHITELIST.has(actionType)) {
    return { allowed: false, reason: 'Action is not whitelisted for Assist-Execute' };
  }

  const rows = await q<{
    risk_environment: string | null;
    cognitive_load: number | string | null;
    context_state: Record<string, any> | null;
  }>(
    `SELECT risk_environment, cognitive_load, context_state
     FROM operator_state
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId]
  );

  const state = rows[0];
  if (!state) {
    return { allowed: false, reason: 'Operator context unavailable' };
  }

  const contextState = (state.context_state || {}) as Record<string, any>;
  const riskEnvironment = String(state.risk_environment || '').toLowerCase();
  const cognitiveLoad = asNumber(state.cognitive_load, 0);
  const operatorBrainState = String(
    contextState?.operatorBrain?.state
    || contextState?.adaptiveInputs?.operatorBrain?.state
    || ''
  ).toUpperCase();
  const heartbeatAt = Date.parse(String(contextState?.heartbeat?.lastAt || ''));
  const thresholds = getRiskGovernorThresholdsFromEnv();

  if (operatorBrainState === 'OVERLOADED') {
    return { allowed: false, reason: 'Operator brain state is overloaded' };
  }
  if (riskEnvironment === 'overloaded') {
    return { allowed: false, reason: 'Risk environment is overloaded' };
  }
  if (cognitiveLoad > thresholds.maxCognitiveLoadForAutoActions) {
    return { allowed: false, reason: 'Cognitive load exceeds policy threshold' };
  }
  if (!Number.isFinite(heartbeatAt) || (Date.now() - heartbeatAt) > 5 * 60_000) {
    return { allowed: false, reason: 'Context heartbeat is stale' };
  }

  return { allowed: true, reason: null };
}

async function createAlertDraft(workspaceId: string, payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol || payload.ticker, 20);
  if (!symbol) throw new Error('alert.create requires symbol');

  const side = asUpper(payload.side || payload.direction, 8);
  const conditionType = side === 'SHORT' || side === 'BEARISH' ? 'price_below' : 'price_above';
  const conditionValue = Math.max(0, asNumber(payload.threshold ?? payload.triggerPrice ?? payload.entryPrice ?? 0, 0));

  const inserted = await q<{ id: number }>(
    `INSERT INTO alerts (
      workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
      name, notes, is_active, is_recurring, notify_email, notify_push,
      is_smart_alert, smart_alert_context, cooldown_minutes
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13, $14::jsonb, $15
    )
    RETURNING id`,
    [
      workspaceId,
      symbol,
      (String(payload.assetClass || 'crypto').toLowerCase() || 'crypto').slice(0, 20),
      conditionType,
      conditionValue,
      String(payload.timeframe || '15m').slice(0, 20),
      `Draft Alert ${symbol}`,
      `Operator draft alert from proposal${payload.packetId ? ` ${payload.packetId}` : ''}.`,
      false,
      false,
      true,
      true,
      false,
      JSON.stringify({
        draft: true,
        source: payload.source || 'operator_actions_execute',
        packetId: payload.packetId || null,
        confidence: asNumber(payload.confidence, 0),
        signalScore: asNumber(payload.signalScore, 0),
      }),
      20,
    ]
  );

  return {
    kind: 'alert_draft',
    alertId: inserted[0]?.id || null,
    symbol,
    conditionType,
    conditionValue,
  };
}

async function createJournalOpen(workspaceId: string, payload: Record<string, any>, guardEnabled: boolean) {
  const symbol = asUpper(payload.symbol || payload.ticker, 20);
  if (!symbol) throw new Error('journal.open requires symbol');

  await ensureJournalRiskColumns();

  const tradeDate = String(payload.tradeDate || new Date().toISOString().slice(0, 10));
  const side = asUpper(payload.side || payload.direction || 'LONG', 8) || 'LONG';
  const entryPrice = Math.max(0, asNumber(payload.entryPrice ?? payload.triggerPrice ?? payload.price ?? 0, 0));
  const stopPrice = Math.max(0, asNumber(payload.stop ?? payload.stopLoss ?? payload.invalidation ?? 0, 0));

  const assetClass = normalizeJournalAssetClass(payload.assetClass || payload.asset_class || payload.market || inferAssetClassFromSymbol(symbol));

  const tags = [
    'operator_draft',
    'assist_execute',
    payload.packetId ? `dp_${String(payload.packetId).slice(0, 50)}` : 'dp_none',
    `asset_class_${assetClass}`,
  ];

  const runtimeInput = await getRuntimeRiskSnapshotInput(workspaceId).catch(() => null);
  const snapshot = buildPermissionSnapshot({
    enabled: guardEnabled,
    regime: runtimeInput?.regime,
    dataStatus: runtimeInput?.dataStatus,
    dataAgeSeconds: runtimeInput?.dataAgeSeconds,
    eventSeverity: runtimeInput?.eventSeverity,
    realizedDailyR: runtimeInput?.realizedDailyR,
    openRiskR: runtimeInput?.openRiskR,
    consecutiveLosses: runtimeInput?.consecutiveLosses,
  });

  if (guardEnabled) {
    if (entryPrice <= 0) {
      throw new Error('Risk governor blocked journal.open: invalid entry price');
    }
    if (stopPrice <= 0) {
      throw new Error('Risk governor blocked journal.open: missing stop/invalidation');
    }

    const direction = side === 'SHORT' || side === 'SELL' || side === 'BEARISH' ? 'SHORT' : 'LONG';
    const atr = Math.max(0.01, asNumber(payload.atr, 0) || (entryPrice * 0.02));
    const evaluation = evaluateCandidate(snapshot, {
      symbol,
      asset_class: assetClass === 'crypto' ? 'crypto' : 'equities',
      strategy_tag: mapPayloadStrategyTag(payload.strategy || payload.setup),
      direction,
      confidence: Math.max(1, Math.min(99, Math.round(asNumber(payload.confidence, 70)))),
      entry_price: entryPrice,
      stop_price: stopPrice,
      atr,
      event_severity: runtimeInput?.eventSeverity || 'none',
    });

    if (evaluation.permission === 'BLOCK') {
      const reason = evaluation.reason_codes?.[0] || 'POLICY_BLOCK';
      throw new Error(`Risk governor blocked journal.open: ${reason}`);
    }
  }

  const equityAtEntry = await getLatestPortfolioEquity(workspaceId);
  const entryRisk = computeEntryRiskMetrics({
    dynamicRiskPerTrade: snapshot.caps.risk_per_trade,
    equityAtEntry,
  });

  // ── Run execution pipeline for stops, targets, sizing ──────────────
  const direction = side === 'SHORT' || side === 'SELL' || side === 'BEARISH' ? 'SHORT' as const : 'LONG' as const;
  const pipeline = await runExecutionPipeline({
    workspaceId,
    symbol,
    side: direction,
    entryPrice,
    assetClass: assetClass as 'crypto' | 'equity' | 'forex' | 'commodity',
    confidence: Math.max(1, Math.min(99, Math.round(asNumber(payload.confidence, 70)))),
    regime: String(runtimeInput?.regime || 'Trend'),
    strategyTag: String(payload.strategy || 'operator_signal'),
    atr: asNumber(payload.atr, 0) || null,
    guardEnabled,
  });

  if (pipeline.ok) {
    const { exits, sizing, leverage: leverageResult } = pipeline.result;
    const pipelineEntryRisk = pipeline.result.entryRisk;

    const inserted = await q<{ id: number }>(
      `INSERT INTO journal_entries (
        workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
        stop_loss, target, risk_amount, planned_rr,
        strategy, setup, notes, emotions, outcome, tags, is_open, asset_class,
        normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry,
        leverage, execution_mode, trail_rule, time_stop_minutes, take_profit_2
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26, $27, $28
      )
      RETURNING id`,
      [
        workspaceId,
        tradeDate,
        symbol,
        direction,
        pipeline.result.tradeType,
        sizing.quantity,
        entryPrice,
        exits.stop_price,
        exits.take_profit_1,
        sizing.total_risk_usd,
        exits.rr_at_tp1,
        String(payload.strategy || 'operator_signal').slice(0, 100),
        String(payload.setup || 'operator_open').slice(0, 120),
        String(payload.notes || 'Operator-created trade with execution engine').slice(0, 3000),
        '',
        'open',
        [...tags, 'execution_engine', 'paper_trade'],
        true,
        assetClass,
        pipelineEntryRisk.normalizedR,
        pipelineEntryRisk.dynamicR,
        pipelineEntryRisk.riskPerTradeAtEntry,
        pipelineEntryRisk.equityAtEntry,
        leverageResult.recommended_leverage,
        'PAPER',
        exits.trail_rule,
        exits.time_stop_minutes,
        exits.take_profit_2,
      ]
    );

    return {
      kind: 'journal_open',
      journalEntryId: inserted[0]?.id || null,
      symbol,
      side,
    };
  }

  // Pipeline rejected — fallback: still create entry with whatever stop the user provided
  const riskAmount = (stopPrice > 0 && entryPrice > 0) ? Math.abs(entryPrice - stopPrice) : 0;
  const plannedRr = (stopPrice > 0 && entryPrice > 0)
    ? (asNumber(payload.target ?? payload.takeProfit ?? 0, 0) > 0
      ? Math.abs(asNumber(payload.target ?? payload.takeProfit ?? 0, 0) - entryPrice) / Math.abs(entryPrice - stopPrice)
      : null)
    : null;

  const inserted = await q<{ id: number }>(
    `INSERT INTO journal_entries (
      workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
      stop_loss, target, risk_amount, planned_rr,
      strategy, setup, notes, emotions, outcome, tags, is_open, asset_class,
      normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry, execution_mode
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24
    )
    RETURNING id`,
    [
      workspaceId,
      tradeDate,
      symbol,
      direction,
      String(payload.tradeType || 'Spot').slice(0, 30),
      1,
      entryPrice,
      stopPrice > 0 ? stopPrice : null,
      asNumber(payload.target ?? payload.takeProfit ?? 0, 0) > 0 ? asNumber(payload.target ?? payload.takeProfit ?? 0, 0) : null,
      riskAmount > 0 ? riskAmount : null,
      plannedRr,
      String(payload.strategy || 'operator_signal').slice(0, 100),
      String(payload.setup || 'operator_open').slice(0, 120),
      `${String(payload.notes || 'Operator-created open trade draft').slice(0, 3000)}\n⚠️ Execution engine: ${!pipeline.ok ? pipeline.reason : 'rejected'}`,
      '',
      'open',
      [...tags, 'missing_execution_engine'],
      true,
      assetClass,
      entryRisk.normalizedR,
      entryRisk.dynamicR,
      entryRisk.riskPerTradeAtEntry,
      entryRisk.equityAtEntry,
      'DRY_RUN',
    ]
  );

  return {
    kind: 'journal_open',
    journalEntryId: inserted[0]?.id || null,
    symbol,
    side,
  };
}

async function createPlanDraft(workspaceId: string, payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol || payload.ticker, 20);
  const packetId = String(payload.packetId || '').slice(0, 120) || null;

  const event = {
    event_id: `evt_plan_draft_${Date.now()}_${randomUUID().slice(0, 8)}`,
    event_type: 'trade.plan.draft.created',
    event_version: 1,
    occurred_at: new Date().toISOString(),
    actor: {
      actor_type: 'system',
      user_id: null,
      anonymous_id: null,
      session_id: null,
    },
    context: {
      tenant_id: 'msp',
      app: { name: 'MarketScannerPros', env: 'prod' },
      page: { route: '/operator', module: 'operator' },
      device: {},
      geo: {},
    },
    entity: {
      entity_type: 'trade_plan',
      entity_id: packetId || `plan_${Date.now()}`,
      symbol: symbol || undefined,
      asset_class: payload.assetClass || 'mixed',
    },
    correlation: {
      workflow_id: packetId ? `wf_${packetId}` : `wf_plan_${Date.now()}`,
      parent_event_id: null,
    },
    payload: {
      source: payload.source || 'operator_actions_execute',
      decision_packet_id: packetId,
      symbol,
      trade_plan: {
        thesis: String(payload.thesis || 'Draft thesis pending confirmation').slice(0, 280),
        entry: payload.entry ?? null,
        stop: payload.stop ?? null,
        targets: Array.isArray(payload.targets) ? payload.targets.slice(0, 4) : [],
      },
    },
  };

  const inserted = await q<{ id: number }>(
    `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id`,
    [
      workspaceId,
      'trade.plan.draft.created',
      JSON.stringify(event),
      JSON.stringify({ route: '/operator', module: 'operator' }),
    ]
  );

  if (packetId) {
    await q(
      `UPDATE decision_packets
       SET status = 'planned',
           packet_data = COALESCE(packet_data, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND packet_id = $3`,
      [
        workspaceId,
        JSON.stringify({
          draftPlanCreatedAt: new Date().toISOString(),
          draftPlanEventId: inserted[0]?.id || null,
        }),
        packetId,
      ]
    );
  }

  return {
    kind: 'plan_draft',
    eventId: inserted[0]?.id || null,
    packetId,
    symbol,
  };
}

async function closeTrade(workspaceId: string, payload: Record<string, any>) {
  const tradeId = Number(payload.tradeId || payload.journalEntryId || 0);
  const exitPrice = asNumber(payload.exitPrice, NaN);

  if (!Number.isFinite(tradeId) || tradeId <= 0) {
    throw new Error('trade.close requires tradeId');
  }

  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    return {
      kind: 'trade_close_draft',
      tradeId,
      requiresInput: true,
      message: 'Exit price is required for trade.close',
    };
  }

  const exitTsIso = String(payload.exitTs || new Date().toISOString());
  const exitReason = String(payload.reason || 'manual').slice(0, 40);
  const notes = String(payload.notes || '').slice(0, 3000);

  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS close_source VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(20)`);

  const rows = await q<{
    id: number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    tags: string[] | null;
    is_open: boolean;
    status: string | null;
    entry_price: number | string | null;
    quantity: number | string | null;
  }>(
    `SELECT id, symbol, side, tags, is_open, status, entry_price, quantity
     FROM journal_entries
     WHERE workspace_id = $1 AND id = $2
     LIMIT 1`,
    [workspaceId, tradeId]
  );

  const trade = rows[0];
  if (!trade) {
    throw new Error('Trade not found');
  }

  if (!trade.is_open || String(trade.status || '').toUpperCase() === 'CLOSED') {
    return {
      kind: 'trade_close',
      tradeId,
      alreadyClosed: true,
    };
  }

  const entryPrice = asNumber(trade.entry_price, 0);
  const quantity = Math.max(0, asNumber(trade.quantity, 0));
  const pnl = trade.side === 'SHORT'
    ? (entryPrice - exitPrice) * quantity
    : (exitPrice - entryPrice) * quantity;
  const plPercent = entryPrice > 0
    ? ((exitPrice - entryPrice) / entryPrice) * 100 * (trade.side === 'SHORT' ? -1 : 1)
    : 0;
  const outcome = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven';

  await q(
    `UPDATE journal_entries
     SET exit_price = $3,
         exit_date = $4::date,
         pl = $5,
         pl_percent = $6,
         outcome = $7,
         is_open = false,
         status = 'CLOSED',
         close_source = 'manual',
         exit_reason = $8,
         notes = CASE WHEN $9::text = '' THEN notes ELSE CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n\n' END, 'Exit Notes: ', $9::text) END,
         updated_at = NOW()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, tradeId, exitPrice, exitTsIso, pnl, plPercent, outcome, exitReason, notes]
  );

  const packetTag = (Array.isArray(trade.tags) ? trade.tags : []).find((tag) => typeof tag === 'string' && tag.startsWith('dp_')) || null;
  const decisionPacketId = String(payload.decisionPacketId || payload.packetId || (packetTag ? packetTag.slice(3) : '')).slice(0, 120) || null;

  if (decisionPacketId) {
    await q(
      `UPDATE decision_packets
       SET status = 'closed',
           updated_at = NOW()
       WHERE workspace_id = $1
         AND packet_id = $2`,
      [workspaceId, decisionPacketId]
    );
  }

  await q(
    `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
     VALUES
       ($1, 'trade.closed', $2::jsonb, $3::jsonb),
       ($1, 'label.outcome.created', $4::jsonb, $3::jsonb)`,
    [
      workspaceId,
      JSON.stringify({
        tradeId,
        symbol: trade.symbol,
        decisionPacketId,
        exitPrice,
        exitTs: exitTsIso,
        reason: exitReason,
        pnl,
        plPercent,
        outcome,
      }),
      JSON.stringify({ route: '/api/actions/execute', module: 'operator_actions' }),
      JSON.stringify({
        tradeId,
        symbol: trade.symbol,
        decisionPacketId,
        outcome,
      }),
    ]
  );

  return {
    kind: 'trade_close',
    tradeId,
    symbol: trade.symbol,
    decisionPacketId,
    exitPrice,
    pnl,
    plPercent,
    outcome,
  };
}

async function pinFocus(workspaceId: string, payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol, 20);
  if (!symbol) throw new Error('focus.pin requires symbol');

  await q(
    `UPDATE operator_state
     SET current_focus = $2,
         updated_at = NOW(),
         context_state = COALESCE(context_state, '{}'::jsonb) || $3::jsonb
     WHERE workspace_id = $1`,
    [
      workspaceId,
      symbol,
      JSON.stringify({ pinnedFocus: { symbol, ttlMinutes: asNumber(payload.ttlMinutes, 60), pinnedAt: new Date().toISOString() } }),
    ]
  );

  return { kind: 'focus_pin', symbol };
}

async function snoozeFocus(workspaceId: string, payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol, 20);
  if (!symbol) throw new Error('focus.snooze requires symbol');

  await q(
    `UPDATE operator_state
     SET context_state = COALESCE(context_state, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE workspace_id = $1`,
    [
      workspaceId,
      JSON.stringify({ snoozedFocus: { symbol, ttlMinutes: asNumber(payload.ttlMinutes, 20), snoozedAt: new Date().toISOString() } }),
    ]
  );

  return { kind: 'focus_snooze', symbol };
}

async function addToWatchlist(workspaceId: string, payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol, 20);
  if (!symbol) throw new Error('watchlist.add requires symbol');

  let watchlistId = Number(payload.watchlistId || 0);
  if (!Number.isFinite(watchlistId) || watchlistId <= 0) {
    const existing = await q<{ id: number }>(
      `SELECT id
       FROM watchlists
       WHERE workspace_id = $1
       ORDER BY is_default DESC, sort_order ASC, created_at ASC
       LIMIT 1`,
      [workspaceId]
    );

    if (existing[0]?.id) {
      watchlistId = Number(existing[0].id);
    } else {
      const created = await q<{ id: number }>(
        `INSERT INTO watchlists (workspace_id, name, is_default, sort_order)
         VALUES ($1, 'Operator Watchlist', true, 0)
         RETURNING id`,
        [workspaceId]
      );
      watchlistId = Number(created[0]?.id || 0);
    }
  }

  if (!watchlistId) throw new Error('Unable to resolve watchlist');

  const orderRows = await q<{ next_order: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM watchlist_items
     WHERE watchlist_id = $1 AND workspace_id = $2`,
    [watchlistId, workspaceId]
  );

  await q(
    `INSERT INTO watchlist_items (watchlist_id, workspace_id, symbol, asset_type, notes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (watchlist_id, symbol) DO UPDATE
       SET notes = EXCLUDED.notes`,
    [
      watchlistId,
      workspaceId,
      symbol,
      String(payload.assetClass || 'equity').slice(0, 20),
      String(payload.notes || 'Added by operator assist-execute').slice(0, 300),
      Number(orderRows[0]?.next_order || 0),
    ]
  );

  return { kind: 'watchlist_add', watchlistId, symbol };
}

async function sendNotification(workspaceId: string, payload: Record<string, any>) {
  await q(
    `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      workspaceId,
      'notify.send',
      JSON.stringify({
        title: String(payload.title || 'Operator Notification').slice(0, 120),
        message: String(payload.message || payload.body || 'Review your latest proposal queue.').slice(0, 3000),
        symbol: asUpper(payload.symbol, 20) || null,
        remindAt: payload.remindAt || null,
      }),
      JSON.stringify({ route: '/operator', module: 'operator_actions' }),
    ]
  );

  return { kind: 'notify_send', queued: true };
}

function exportOrderDraft(payload: Record<string, any>) {
  const symbol = asUpper(payload.symbol, 20) || 'SYMBOL';
  const side = asUpper(payload.side || 'BUY', 8) || 'BUY';
  const qty = Math.max(1, Math.round(asNumber(payload.quantity, 1)));
  const entry = asNumber(payload.entryPrice ?? payload.entry ?? 0, 0);
  const stop = asNumber(payload.stop ?? payload.stopLoss ?? 0, 0);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];

  const lines = [
    `SYMBOL=${symbol}`,
    `SIDE=${side}`,
    `QTY=${qty}`,
    `ENTRY=${entry > 0 ? entry.toFixed(2) : 'MKT'}`,
    `STOP=${stop > 0 ? stop.toFixed(2) : 'N/A'}`,
    `TARGETS=${targets.length ? targets.map((target) => Number(target).toFixed(2)).join(',') : 'N/A'}`,
    'BROKER_EXECUTION=MANUAL_ONLY',
  ];

  return {
    kind: 'order_export',
    format: 'text/plain',
    draft: lines.join('\n'),
  };
}

async function performAction(
  workspaceId: string,
  actionType: CanonicalActionType,
  payload: Record<string, any>,
  effectiveMode: ExecuteMode,
  options: { guardEnabled: boolean }
) {
  if (actionType === 'alert.create') return createAlertDraft(workspaceId, payload);
  if (actionType === 'plan.create') return createPlanDraft(workspaceId, payload);
  if (actionType === 'journal.open') return createJournalOpen(workspaceId, payload, options.guardEnabled);
  if (actionType === 'trade.close') return closeTrade(workspaceId, payload);
  if (actionType === 'focus.pin') return pinFocus(workspaceId, payload);
  if (actionType === 'focus.snooze') return snoozeFocus(workspaceId, payload);
  if (actionType === 'watchlist.add') return addToWatchlist(workspaceId, payload);
  if (actionType === 'notify.send') return sendNotification(workspaceId, payload);
  if (actionType === 'order.export') return exportOrderDraft(payload);

  throw new Error(`Unsupported action type: ${actionType}`);
}

export async function POST(req: NextRequest) {
  let workspaceIdForFailure: string | null = null;
  let idempotencyKeyForFailure: string | null = null;

  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    workspaceIdForFailure = session.workspaceId;

    const body = (await req.json().catch(() => ({}))) as ExecuteActionPayload;
    const parsedActionType = mapToCanonicalActionType(body.actionType || body?.action?.type);
    const requestedMode = normalizeMode(body.mode || body?.action?.mode);
    const payload = (
      body.params && typeof body.params === 'object'
        ? body.params
        : body?.action?.payload && typeof body.action.payload === 'object'
          ? body.action.payload
          : {}
    ) as Record<string, any>;

    if (!parsedActionType) {
      return NextResponse.json({ error: 'Unsupported action type' }, { status: 400 });
    }

    await ensureActionTable();

    const idempotencyKey = String(body.idempotencyKey || '').trim().slice(0, 160)
      || createIdempotencyFallback(session.workspaceId, parsedActionType, payload);

    idempotencyKeyForFailure = idempotencyKey;

    const created = await q<{ id: number }>(
      `INSERT INTO operator_action_executions (
         workspace_id, idempotency_key, proposal_id, action_type, source, mode, status, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'processing', $7::jsonb
       )
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        session.workspaceId,
        idempotencyKey,
        body.proposalId ? String(body.proposalId).slice(0, 160) : null,
        parsedActionType,
        body.source ? String(body.source).slice(0, 80) : 'operator_actions_execute',
        requestedMode,
        JSON.stringify(payload),
      ]
    );

    if (!created[0]?.id) {
      const existing = await q<{ status: string; result: any; error_message: string | null }>(
        `SELECT status, result, error_message
         FROM operator_action_executions
         WHERE workspace_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [session.workspaceId, idempotencyKey]
      );

      const row = existing[0];
      if (row?.status === 'completed') {
        return NextResponse.json({
          success: true,
          replay: true,
          idempotencyKey,
          result: row.result || {},
        });
      }
      if (row?.status === 'failed') {
        return NextResponse.json(
          {
            error: 'Previous execution failed for this idempotency key',
            idempotencyKey,
            message: row.error_message || 'Action failed',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Action is already processing', idempotencyKey },
        { status: 409 }
      );
    }

    const assistGate = await evaluateAssistGate(session.workspaceId, parsedActionType);
    const effectiveMode: ExecuteMode = requestedMode === 'assist' && assistGate.allowed ? 'assist' : 'draft';
    const downgradeReason = requestedMode === 'assist' && !assistGate.allowed ? assistGate.reason : null;
    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';

    const result = await performAction(
      session.workspaceId,
      parsedActionType,
      {
        ...payload,
        source: body.source || 'operator_actions_execute',
        packetId: body.decisionPacketId || payload.packetId || null,
      },
      effectiveMode,
      { guardEnabled }
    );

    await q(
      `UPDATE operator_action_executions
       SET status = 'completed',
           mode = $3,
           result = $4::jsonb,
           updated_at = NOW()
       WHERE workspace_id = $1 AND idempotency_key = $2`,
      [
        session.workspaceId,
        idempotencyKey,
        effectiveMode,
        JSON.stringify({
          actionType: parsedActionType,
          legacyActionType: mapToLegacyActionType(parsedActionType),
          requestedMode,
          effectiveMode,
          downgradeReason,
          output: result,
        }),
      ]
    );

    const auditEvent = {
      event_id: `evt_action_executed_${Date.now()}_${randomUUID().slice(0, 8)}`,
      actionType: parsedActionType,
      legacyActionType: mapToLegacyActionType(parsedActionType),
      requestedMode,
      effectiveMode,
      downgradeReason,
      idempotencyKey,
      proposalId: body.proposalId || null,
      decisionPacketId: body.decisionPacketId || null,
      source: body.source || 'operator_actions_execute',
      payload,
      result,
      executedAt: new Date().toISOString(),
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        session.workspaceId,
        'action.executed',
        JSON.stringify(auditEvent),
        JSON.stringify({ route: '/operator', module: 'operator' }),
      ]
    );

    return NextResponse.json({
      success: true,
      replay: false,
      idempotencyKey,
      actionType: parsedActionType,
      requestedMode,
      effectiveMode,
      downgradeReason,
      result,
    });
  } catch (error: any) {
    try {
      if (workspaceIdForFailure && idempotencyKeyForFailure) {
        await ensureActionTable();
        await q(
          `UPDATE operator_action_executions
           SET status = 'failed',
               error_message = $3,
               updated_at = NOW()
           WHERE workspace_id = $1 AND idempotency_key = $2`,
          [workspaceIdForFailure, idempotencyKeyForFailure, String(error?.message || 'Execution failed').slice(0, 400)]
        );
      }
    } catch {
      // ignore secondary failures
    }

    console.error('[actions/execute] POST error:', error);
    const message = String(error?.message || 'Failed to execute action');
    const status = message.startsWith('Risk governor blocked') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
