import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { emitTradeLifecycleEvent, hashDedupeKey } from '@/lib/notifications/tradeEvents';
import { buildPermissionSnapshot } from '@/lib/risk-governor-hard';
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';
import { buildExitPlan } from '@/lib/execution/exits';
import { computePositionSize } from '@/lib/execution/positionSizing';
import { computeLeverage } from '@/lib/execution/leverage';
import { evaluateGovernor } from '@/lib/execution/riskGovernor';
import { fetchATR } from '@/lib/execution/fetchATR';
import type { TradeIntent, AssetClass } from '@/lib/execution/types';
import type { Regime, StrategyTag, Direction } from '@/lib/risk-governor-hard';

function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

function inferJournalAssetClass(args: { symbol?: string; conditionType?: string; source?: string; assetClass?: unknown; assetType?: unknown }) {
  if (args.assetClass || args.assetType) {
    return normalizeJournalAssetClass(args.assetClass || args.assetType);
  }

  const condition = String(args.conditionType || '').toLowerCase();
  if (condition.includes('_crypto')) return 'crypto';
  if (condition.includes('_forex')) return 'forex';

  const source = String(args.source || '').toLowerCase();
  if (source.includes('crypto')) return 'crypto';
  if (source.includes('forex')) return 'forex';

  const symbol = String(args.symbol || '').toUpperCase();
  if (symbol.endsWith('USD') || symbol.endsWith('USDT')) return 'crypto';
  return 'equity';
}

async function ensureJournalSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      trade_date DATE NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
      trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin')),
      option_type VARCHAR(10),
      strike_price DECIMAL(18, 8),
      expiration_date DATE,
      quantity DECIMAL(18, 8) NOT NULL,
      entry_price DECIMAL(18, 8) NOT NULL,
      exit_price DECIMAL(18, 8),
      exit_date DATE,
      pl DECIMAL(18, 8),
      pl_percent DECIMAL(10, 4),
      strategy VARCHAR(100),
      setup VARCHAR(100),
      notes TEXT,
      emotions TEXT,
      outcome VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),
      tags TEXT[],
      is_open BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON journal_entries (workspace_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (workspace_id, trade_date DESC)`);

  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8)`);

  // ── Execution engine columns (migration 044) ──
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS leverage DECIMAL(10,2)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS trail_rule VARCHAR(30) DEFAULT 'NONE'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS time_stop_minutes INTEGER DEFAULT 0`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS take_profit_2 DECIMAL(18,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(10) DEFAULT 'DRY_RUN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS max_loss_usd DECIMAL(18,2)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status_reason VARCHAR(120)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS proposal_id UUID`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS broker_order_id VARCHAR(120)`);
}

function inferSide(conditionType?: string, conditionMet?: string): 'LONG' | 'SHORT' {
  const signal = `${conditionType || ''} ${conditionMet || ''}`.toLowerCase();

  if (
    signal.includes('below') ||
    signal.includes('sell') ||
    signal.includes('bear') ||
    signal.includes('short') ||
    signal.includes('greed_extreme') ||
    signal.includes('funding_extreme_pos')
  ) {
    return 'SHORT';
  }

  return 'LONG';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      symbol,
      conditionType,
      conditionMet,
      triggerPrice,
      triggeredAt,
      historyId,
      source,
      operatorMode,
      operatorBias,
      operatorRisk,
      operatorEdge,
      marketRegime,
      marketMood,
      derivativesBias,
      sectorStrength,
      workflowId,
      parentEventId,
      decisionPacketId,
      assetClass,
      assetType,
    } = body || {};

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    await ensureJournalSchema();

    const safeSymbol = String(symbol).toUpperCase().slice(0, 20);
    const safeCondition = String(conditionMet || conditionType || 'alert_trigger').slice(0, 100);
    const tradeDateIso = triggeredAt ? new Date(triggeredAt) : new Date();
    const tradeDate = Number.isNaN(tradeDateIso.getTime())
      ? new Date().toISOString().slice(0, 10)
      : tradeDateIso.toISOString().slice(0, 10);

    const entryPriceRaw = Number(triggerPrice);
    const entryPrice = Number.isFinite(entryPriceRaw) && entryPriceRaw > 0 ? entryPriceRaw : 1;
    const side = inferSide(conditionType, conditionMet);

    const safeSource = String(source || 'alert_intelligence').slice(0, 40);
    const safeOperatorMode = String(operatorMode || 'OBSERVE').toUpperCase().slice(0, 20);
    const safeBias = String(operatorBias || 'NEUTRAL').toUpperCase().slice(0, 20);
    const safeRisk = String(operatorRisk || 'MODERATE').toUpperCase().slice(0, 20);
    const safeRegime = String(marketRegime || 'UNKNOWN').slice(0, 40);
    const safeMood = String(marketMood || 'BALANCED').slice(0, 40);
    const safeDerivativesBias = String(derivativesBias || 'NEUTRAL').slice(0, 40);
    const safeSectorStrength = String(sectorStrength || 'MIXED').slice(0, 40);
    const edge = Number.isFinite(Number(operatorEdge)) ? Math.max(1, Math.min(99, Number(operatorEdge))) : 50;
    const safeDecisionPacketId = typeof decisionPacketId === 'string' && decisionPacketId.trim()
      ? decisionPacketId.trim().slice(0, 120)
      : null;
    const safeAssetClass = inferJournalAssetClass({
      symbol: safeSymbol,
      conditionType,
      source,
      assetClass,
      assetType,
    });

    // ── Execution Engine: build full paper trade ──────────────────────
    // Map regime string → engine Regime type
    const regimeMap: Record<string, Regime> = {
      'trend': 'TREND_UP', 'trend up': 'TREND_UP', 'trend_up': 'TREND_UP', 'bullish': 'TREND_UP',
      'trend down': 'TREND_DOWN', 'trend_down': 'TREND_DOWN', 'bearish': 'TREND_DOWN',
      'range': 'RANGE_NEUTRAL', 'range_neutral': 'RANGE_NEUTRAL', 'neutral': 'RANGE_NEUTRAL',
      'volatility expansion': 'VOL_EXPANSION', 'vol_expansion': 'VOL_EXPANSION',
      'volatility contraction': 'VOL_CONTRACTION', 'vol_contraction': 'VOL_CONTRACTION',
      'risk off': 'RISK_OFF_STRESS', 'risk_off_stress': 'RISK_OFF_STRESS', 'defensive': 'RISK_OFF_STRESS',
    };
    const engineRegime: Regime = regimeMap[safeRegime.toLowerCase()] ?? 'RANGE_NEUTRAL';

    // Map strategy from condition type
    const strategyMap: Record<string, StrategyTag> = {
      'scanner_signal': 'TREND_PULLBACK',
      'strategy_signal': 'BREAKOUT_CONTINUATION',
      'alert_intelligence': 'MOMENTUM_REVERSAL',
    };
    const rawStrategyId = conditionType && String(conditionType).startsWith('strategy_')
      ? 'strategy_signal'
      : conditionType && String(conditionType).startsWith('scanner_')
      ? 'scanner_signal'
      : 'alert_intelligence';
    const engineStrategy: StrategyTag = strategyMap[rawStrategyId] ?? 'TREND_PULLBACK';
    const engineDirection: Direction = side as Direction;

    // ATR: use passed value from scanner, or fetch real ATR from Alpha Vantage
    const rawAtr = Number(body.atr);
    let atr: number;
    if (Number.isFinite(rawAtr) && rawAtr > 0) {
      atr = rawAtr;
    } else {
      // Fetch real ATR — no guessing
      const fetchedAtr = await fetchATR(safeSymbol, safeAssetClass);
      if (fetchedAtr && fetchedAtr > 0) {
        atr = fetchedAtr;
        console.info(`[auto-log] Fetched ATR for ${safeSymbol}: ${atr.toFixed(4)}`);
      } else {
        // Cannot compute exit strategy without ATR — reject
        return NextResponse.json(
          { error: `No ATR available for ${safeSymbol} — cannot compute exit strategy. Trade rejected.` },
          { status: 422 },
        );
      }
    }

    // Resolve account equity
    const equityAtEntry = await getLatestPortfolioEquity(session.workspaceId);
    const accountEquity = equityAtEntry ?? 100_000;

    // Build trade intent for execution engine
    const intent: TradeIntent = {
      symbol: safeSymbol,
      asset_class: (safeAssetClass === 'commodity' ? 'equity' : safeAssetClass) as AssetClass,
      direction: engineDirection,
      strategy_tag: engineStrategy,
      confidence: edge,
      regime: engineRegime,
      entry_price: entryPrice,
      atr,
      account_equity: accountEquity,
    };

    // Get open positions for correlation check
    const openRows = await q<{ symbol: string; side: string; asset_class: string }>(
      `SELECT symbol, side, asset_class FROM journal_entries WHERE workspace_id = $1 AND is_open = true`,
      [session.workspaceId],
    );
    intent.open_positions = openRows.map((r) => ({
      symbol: r.symbol,
      direction: r.side.toUpperCase() as Direction,
      asset_class: (r.asset_class || 'equity') as AssetClass,
    }));

    // ── Execution Engine pipeline ──────────────────────────────────────
    const exits = buildExitPlan({
      direction: engineDirection,
      entry_price: entryPrice,
      atr,
      asset_class: intent.asset_class,
      regime: engineRegime,
      strategy_tag: engineStrategy,
    });

    // Validate exit plan — reject if stop or TP is invalid
    const stopOk = Number.isFinite(exits.stop_price) && exits.stop_price > 0;
    const tpOk = Number.isFinite(exits.take_profit_1) && exits.take_profit_1 > 0;
    const rrOk = Number.isFinite(exits.rr_at_tp1) && exits.rr_at_tp1 >= 1;
    if (!stopOk || !tpOk || !rrOk) {
      return NextResponse.json(
        {
          error: `Exit strategy invalid for ${safeSymbol} — stop: ${exits.stop_price}, tp1: ${exits.take_profit_1}, R:R ${exits.rr_at_tp1}. Trade rejected.`,
          exits,
        },
        { status: 422 },
      );
    }

    const atrPct = entryPrice > 0 ? (atr / entryPrice) * 100 : 2;

    // Build permission snapshot for governor
    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';
    const riskInput = await import('@/lib/risk/runtimeSnapshot').then(m => m.getRuntimeRiskSnapshotInput(session.workspaceId)).catch(() => ({}));
    const snapshot = buildPermissionSnapshot({ enabled: guardEnabled, ...riskInput });

    // Enforce governor: reject auto-log when risk mode is LOCKED
    if (snapshot.risk_mode === 'LOCKED') {
      return NextResponse.json(
        { error: 'Risk governor is LOCKED — auto-log blocked. No new risk entries allowed.', riskMode: 'LOCKED' },
        { status: 403 }
      );
    }

    // Governor check (execution layer with daily loss, heat, open count)
    const dailyLossRows = await q<{ daily_loss: string }>(
      `SELECT COALESCE(SUM(pl), 0) AS daily_loss FROM journal_entries
       WHERE workspace_id = $1 AND is_open = false AND exit_date::date = CURRENT_DATE`,
      [session.workspaceId],
    );
    const dailyLossPct = accountEquity > 0
      ? Math.abs(Number(dailyLossRows[0]?.daily_loss ?? 0)) / accountEquity
      : 0;
    const openCount = openRows.length;
    const portfolioHeatRows = await q<{ total_risk: string }>(
      `SELECT COALESCE(SUM(risk_amount), 0)::text AS total_risk FROM journal_entries
       WHERE workspace_id = $1 AND is_open = true`,
      [session.workspaceId],
    );
    const portfolioHeat = accountEquity > 0
      ? Number(portfolioHeatRows[0]?.total_risk ?? 0) / accountEquity
      : 0;

    const governor = await evaluateGovernor(intent, exits, {
      snapshot,
      current_daily_loss_pct: dailyLossPct,
      current_portfolio_heat_pct: portfolioHeat,
      current_open_trade_count: openCount,
    });

    // Block if governor says no
    if (!governor.allowed) {
      return NextResponse.json(
        {
          error: `Execution engine blocked: ${governor.reason_codes.join(', ')}`,
          riskMode: governor.risk_mode,
          governor,
        },
        { status: 403 },
      );
    }

    // Leverage
    const leverageResult = computeLeverage({
      asset_class: intent.asset_class,
      regime: engineRegime,
      risk_mode: governor.risk_mode,
      atr_percent: atrPct,
    });

    // Position sizing
    const sizing = computePositionSize(intent, {
      governor_risk_per_trade: governor.risk_per_trade,
      governor_max_position_size: governor.max_position_size,
      effective_leverage: leverageResult.recommended_leverage,
    });

    const entryRisk = computeEntryRiskMetrics({
      equityAtEntry: accountEquity,
      dynamicRiskPerTrade: sizing.risk_pct,
    });

    // Determine trade type
    let tradeType = 'Spot';
    if (leverageResult.recommended_leverage > 1) tradeType = 'Margin';

    const tradeStory = [
      'AUTO TRADE — EXECUTION ENGINE (PAPER)',
      `Signal Source: ${safeSource}`,
      `Market Mode: ${safeOperatorMode}`,
      `Macro Bias: ${safeBias}`,
      `Risk State: ${safeRisk}`,
      `Regime: ${safeRegime} → ${engineRegime}`,
      `Market Mood: ${safeMood}`,
      `Derivatives Sentiment: ${safeDerivativesBias}`,
      `Sector Strength: ${safeSectorStrength}`,
      `Entry Reason: ${safeCondition}`,
      `Confidence: ${edge}`,
      `ATR: ${atr.toFixed(4)}`,
      `Stop: ${exits.stop_price} | TP1: ${exits.take_profit_1} | TP2: ${exits.take_profit_2 ?? 'n/a'}`,
      `Trail: ${exits.trail_rule} | Time Stop: ${exits.time_stop_minutes}m`,
      `Qty: ${sizing.quantity} | Risk: $${sizing.total_risk_usd.toFixed(2)} (${(sizing.risk_pct * 100).toFixed(2)}%)`,
      `Leverage: ${leverageResult.recommended_leverage}× | Notional: $${sizing.notional_usd.toFixed(0)}`,
      `R:R ${exits.rr_at_tp1}:1`,
    ].join(' • ');

    const psychologyPrompt = 'Psychology Prompt: Did you follow your original plan? Was sizing correct? What emotion did you feel at entry?';

    const notes = [
      'PAPER TRADE — Execution Engine auto-created from triggered signal.',
      `Condition: ${safeCondition}`,
      `Triggered Price: ${entryPrice}`,
      `Triggered At: ${triggeredAt || new Date().toISOString()}`,
      `Decision Packet: ${safeDecisionPacketId || 'n/a'}`,
      tradeStory,
      psychologyPrompt,
      JSON.stringify({
        execution_engine: true,
        mode: 'PAPER',
        trail_rule: exits.trail_rule,
        time_stop_minutes: exits.time_stop_minutes,
        tp2: exits.take_profit_2,
        leverage: leverageResult,
        governor_codes: governor.reason_codes,
      }),
    ].join('\n');

    const tags = ['auto_alert', 'execution_engine', 'paper_trade', safeSource, `mode_${safeOperatorMode.toLowerCase()}`, `asset_class_${safeAssetClass}`];
    if (safeDecisionPacketId) {
      tags.push(`dp_${safeDecisionPacketId}`);
    }

    const inserted = await q(
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
        session.workspaceId,
        tradeDate,
        safeSymbol,
        side,
        tradeType,
        sizing.quantity,
        entryPrice,
        exits.stop_price,
        exits.take_profit_1,
        sizing.total_risk_usd,
        exits.rr_at_tp1,
        rawStrategyId,
        safeCondition,
        notes,
        '',
        'open',
        tags,
        true,
        safeAssetClass,
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

    const insertedId = Number(inserted[0]?.id || 0);
    if (insertedId > 0) {
      const dedupe = hashDedupeKey([
        'TRADE_ENTERED',
        session.workspaceId,
        insertedId,
        safeSymbol,
        tradeDate,
      ]);

      await emitTradeLifecycleEvent({
        workspaceId: session.workspaceId,
        eventType: 'TRADE_ENTERED',
        aggregateId: `trade_${insertedId}`,
        dedupeKey: `trade_entered_${dedupe}`,
        payload: {
          journalEntryId: insertedId,
          symbol: safeSymbol,
          side,
          tradeDate,
          quantity: sizing.quantity,
          entryPrice,
          stopLoss: exits.stop_price,
          takeProfit1: exits.take_profit_1,
          takeProfit2: exits.take_profit_2,
          riskUsd: sizing.total_risk_usd,
          rr: exits.rr_at_tp1,
          leverage: leverageResult.recommended_leverage,
          trailRule: exits.trail_rule,
          executionMode: 'PAPER',
          strategy: rawStrategyId,
          setup: safeCondition,
          source: 'journal_auto_log',
          decisionPacketId: safeDecisionPacketId,
          assetClass: safeAssetClass,
        },
      }).catch((error) => {
        console.warn('[journal/auto-log] failed to emit TRADE_ENTERED event:', error);
      });
    }

    if (historyId) {
      await q(
        `UPDATE alert_history
         SET user_action = 'journal_logged'
         WHERE id = $1 AND workspace_id = $2`,
        [historyId, session.workspaceId]
      );
    }

    try {
      const workflow_id = String(workflowId || `wf_alerts_${safeSymbol}_${tradeDate.replaceAll('-', '')}`).slice(0, 120);
      const parent_event_id = parentEventId ? String(parentEventId).slice(0, 120) : null;

      await q(
        `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
         VALUES ($1, $2, $3::jsonb, $4::jsonb),
                ($1, $5, $6::jsonb, $4::jsonb)`,
        [
          session.workspaceId,
          'journal.draft.created',
          JSON.stringify({
            symbol: safeSymbol,
            entryId: inserted[0]?.id || null,
            strategy: rawStrategyId,
            source: safeSource,
            mode: safeOperatorMode,
            confidence: edge,
            decision_packet_id: safeDecisionPacketId,
            correlation: {
              workflow_id,
              parent_event_id,
            },
          }),
          JSON.stringify({ name: 'alerts_triggered_feed', skill: 'journal' }),
          'trade.story.generated',
          JSON.stringify({
            symbol: safeSymbol,
            story: tradeStory,
            source: safeSource,
            decision_packet_id: safeDecisionPacketId,
            correlation: {
              workflow_id,
              parent_event_id,
            },
          }),
        ]
      );
    } catch (eventError) {
      console.error('Failed to log workflow events for auto-log:', eventError);
    }

    return NextResponse.json({
      success: true,
      entryId: inserted[0]?.id || null,
      tradeStory,
      executionEngine: {
        mode: 'PAPER',
        quantity: sizing.quantity,
        stop: exits.stop_price,
        tp1: exits.take_profit_1,
        tp2: exits.take_profit_2,
        riskUsd: sizing.total_risk_usd,
        rr: exits.rr_at_tp1,
        leverage: leverageResult.recommended_leverage,
        trailRule: exits.trail_rule,
        timeStopMin: exits.time_stop_minutes,
      },
    });
  } catch (error) {
    console.error('Journal auto-log error:', error);
    return NextResponse.json({ error: 'Failed to auto-log journal entry' }, { status: 500 });
  }
}
