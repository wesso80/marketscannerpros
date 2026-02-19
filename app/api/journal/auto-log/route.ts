import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { emitTradeLifecycleEvent, hashDedupeKey } from '@/lib/notifications/tradeEvents';

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

    const tradeStory = [
      'AUTO TRADE STORY',
      `Signal Source: ${safeSource}`,
      `Market Mode: ${safeOperatorMode}`,
      `Macro Bias: ${safeBias}`,
      `Risk State: ${safeRisk}`,
      `Regime: ${safeRegime}`,
      `Market Mood: ${safeMood}`,
      `Derivatives Sentiment: ${safeDerivativesBias}`,
      `Sector Strength: ${safeSectorStrength}`,
      `Entry Reason: ${safeCondition}`,
      `Operator Edge: ${edge}`,
    ].join(' • ');

    const psychologyPrompt = 'Psychology Prompt: Did you follow your original plan? Was sizing correct? What emotion did you feel at entry?';

    const strategyId = conditionType && String(conditionType).startsWith('strategy_')
      ? 'strategy_signal'
      : conditionType && String(conditionType).startsWith('scanner_')
      ? 'scanner_signal'
      : 'alert_intelligence';

    const notes = [
      'Auto-created from triggered signal feed.',
      `Condition: ${safeCondition}`,
      `Triggered Price: ${entryPrice}`,
      `Triggered At: ${triggeredAt || new Date().toISOString()}`,
      `Decision Packet: ${safeDecisionPacketId || 'n/a'}`,
      tradeStory,
      psychologyPrompt,
    ].join('\n');

    const tags = ['auto_alert', 'triggered_feed', safeSource, `mode_${safeOperatorMode.toLowerCase()}`, `asset_class_${safeAssetClass}`];
    if (safeDecisionPacketId) {
      tags.push(`dp_${safeDecisionPacketId}`);
    }

    const inserted = await q(
      `INSERT INTO journal_entries (
        workspace_id, trade_date, symbol, side, trade_type, quantity, entry_price,
        strategy, setup, notes, emotions, outcome, tags, is_open, asset_class
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING id`,
      [
        session.workspaceId,
        tradeDate,
        safeSymbol,
        side,
        'Spot',
        1,
        entryPrice,
        strategyId,
        safeCondition,
        notes,
        '',
        'open',
        tags,
        true,
        safeAssetClass,
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
          quantity: 1,
          entryPrice,
          strategy: strategyId,
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
            strategy: strategyId,
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
    });
  } catch (error) {
    console.error('Journal auto-log error:', error);
    return NextResponse.json({ error: 'Failed to auto-log journal entry' }, { status: 500 });
  }
}
