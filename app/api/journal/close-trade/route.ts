import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { enqueueEngineJob } from '@/lib/engine/jobQueue';
import { q, tx } from '@/lib/db';
import { emitTradeLifecycleEvent, hashDedupeKey } from '@/lib/notifications/tradeEvents';

type ExitReason = 'tp' | 'sl' | 'manual' | 'time' | 'invalidated';
type CloseSource = 'manual' | 'mark' | 'broker';

type JournalEntryRow = {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  trade_date: string;
  entry_price: string | number;
  quantity: string | number;
  risk_amount: string | number | null;
  tags: string[] | null;
  is_open: boolean;
  status: string | null;
  exit_price: string | number | null;
  exit_date: string | null;
  pl: string | number | null;
  pl_percent: string | number | null;
  r_multiple: string | number | null;
  outcome: string | null;
};

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoOrNow(value: unknown): string {
  if (typeof value === 'string') {
    const ts = Date.parse(value);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

function parseDecisionPacketId(tags: string[] = []): string | null {
  for (const tag of tags) {
    if (typeof tag === 'string' && tag.startsWith('dp_') && tag.length > 3) return tag.slice(3);
  }
  return null;
}

async function ensureCloseSchema() {
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS close_source VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS followed_plan BOOLEAN`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_intent_id VARCHAR(120)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8)`);

  await q(`
    CREATE TABLE IF NOT EXISTS journal_exit_intents (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      journal_entry_id INTEGER NOT NULL,
      exit_intent_id VARCHAR(120) NOT NULL,
      exit_reason VARCHAR(20) NOT NULL,
      exit_action VARCHAR(20) NOT NULL,
      close_source VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'requested',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (workspace_id, exit_intent_id)
    )
  `);

  await q(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_exit_one_active
    ON journal_exit_intents (workspace_id, journal_entry_id)
    WHERE status IN ('requested', 'pending')
  `);
}

function toCloseOutcome(pl: number): 'win' | 'loss' | 'breakeven' {
  if (pl > 0) return 'win';
  if (pl < 0) return 'loss';
  return 'breakeven';
}

function buildExitIntentId(input: {
  workspaceId: string;
  journalEntryId: number;
  exitReason: ExitReason;
  closeSource: CloseSource;
  serverTsIso: string;
}) {
  const raw = `${input.workspaceId}:${input.journalEntryId}:${input.exitReason}:CLOSE:${input.closeSource}:${input.serverTsIso}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 48);
}

export async function POST(req: NextRequest) {
  let closeFailureContext: {
    workspaceId?: string;
    journalEntryId?: number;
    symbol?: string;
    exitReason?: ExitReason;
    closeSource?: CloseSource;
  } = {};

  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    closeFailureContext.workspaceId = session.workspaceId;

    await ensureCloseSchema();

    const body = await req.json();
    const journalEntryId = Number(body?.journalEntryId);
    const exitPrice = parseNumber(body?.exitPrice);
    const exitTsIso = toIsoOrNow(body?.exitTs);
    const exitReason = String(body?.exitReason || 'manual') as ExitReason;
    const closeSource = String(body?.closeSource || 'manual') as CloseSource;
    const followedPlan = body?.followedPlan == null ? null : Boolean(body.followedPlan);
    const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 4000) : null;

    closeFailureContext.journalEntryId = journalEntryId;
    closeFailureContext.exitReason = exitReason;
    closeFailureContext.closeSource = closeSource;

    if (!Number.isFinite(journalEntryId) || journalEntryId <= 0) {
      return NextResponse.json({ error: 'journalEntryId is required' }, { status: 400 });
    }
    if (exitPrice == null || exitPrice <= 0) {
      return NextResponse.json({ error: 'Valid exitPrice is required' }, { status: 400 });
    }
    if (!['tp', 'sl', 'manual', 'time', 'invalidated'].includes(exitReason)) {
      return NextResponse.json({ error: 'Invalid exitReason' }, { status: 400 });
    }
    if (!['manual', 'mark', 'broker'].includes(closeSource)) {
      return NextResponse.json({ error: 'Invalid closeSource' }, { status: 400 });
    }

    const serverTsIso = new Date().toISOString();
    const exitIntentId = typeof body?.exitIntentId === 'string' && body.exitIntentId.trim()
      ? body.exitIntentId.slice(0, 120)
      : buildExitIntentId({
          workspaceId: session.workspaceId,
          journalEntryId,
          exitReason,
          closeSource,
          serverTsIso,
        });

    const result = await tx(async (client) => {
      const entryRes = await client.query<JournalEntryRow>(
        `SELECT id, symbol, side, trade_date, entry_price, quantity, risk_amount, tags, is_open, status,
                exit_price, exit_date, pl, pl_percent, r_multiple, outcome
           FROM journal_entries
          WHERE workspace_id = $1 AND id = $2
          FOR UPDATE`,
        [session.workspaceId, journalEntryId]
      );

      if (entryRes.rows.length === 0) {
        return { notFound: true } as const;
      }

      const entry = entryRes.rows[0];
      if (!entry.is_open || (entry.status || '').toUpperCase() === 'CLOSED') {
        return {
          alreadyClosed: true,
          entry,
          exitIntentId: entry.exit_date ? `closed_${journalEntryId}` : null,
        } as const;
      }

      await client.query(
        `INSERT INTO journal_exit_intents (
           workspace_id, journal_entry_id, exit_intent_id, exit_reason, exit_action, close_source, status, payload
         ) VALUES ($1, $2, $3, $4, 'CLOSE', $5, 'requested', $6::jsonb)
         ON CONFLICT (workspace_id, exit_intent_id) DO NOTHING`,
        [
          session.workspaceId,
          journalEntryId,
          exitIntentId,
          exitReason,
          closeSource,
          JSON.stringify({ exitTs: exitTsIso, exitPrice, followedPlan, notes }),
        ]
      );

      await client.query(
        `UPDATE journal_entries
            SET status = 'EXIT_PENDING', exit_intent_id = $3, updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2`,
        [session.workspaceId, journalEntryId, exitIntentId]
      );

      await client.query(
        `UPDATE journal_exit_intents
            SET status = 'pending'
          WHERE workspace_id = $1 AND journal_entry_id = $2 AND exit_intent_id = $3`,
        [session.workspaceId, journalEntryId, exitIntentId]
      );

      const entryPrice = parseNumber(entry.entry_price) ?? 0;
      const quantity = parseNumber(entry.quantity) ?? 0;
      const riskAmount = parseNumber(entry.risk_amount) ?? null;

      const pl = entry.side === 'LONG'
        ? (exitPrice - entryPrice) * quantity
        : (entryPrice - exitPrice) * quantity;
      const plPercent = entryPrice > 0
        ? ((exitPrice - entryPrice) / entryPrice) * 100 * (entry.side === 'LONG' ? 1 : -1)
        : 0;
      const rMultiple = riskAmount && riskAmount > 0 ? pl / riskAmount : null;
      const outcome = toCloseOutcome(pl);

      const updateRes = await client.query<JournalEntryRow>(
        `UPDATE journal_entries
            SET exit_price = $3,
                exit_date = $4::date,
                pl = $5,
                pl_percent = $6,
                r_multiple = $7,
                normalized_r = CASE
                  WHEN COALESCE(equity_at_entry, 0) > 0
                    THEN $5 / (equity_at_entry * 0.01)
                  ELSE normalized_r
                END,
                dynamic_r = CASE
                  WHEN COALESCE(equity_at_entry, 0) > 0 AND COALESCE(risk_per_trade_at_entry, 0) > 0
                    THEN $5 / (equity_at_entry * risk_per_trade_at_entry)
                  ELSE dynamic_r
                END,
                outcome = $8,
                is_open = false,
                status = 'CLOSED',
                close_source = $9,
                exit_reason = $10,
                followed_plan = $11,
                notes = CASE WHEN $12::text IS NULL OR $12::text = '' THEN notes ELSE CONCAT(COALESCE(notes, ''), CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n\n' END, 'Exit Notes: ', $12::text) END,
                updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2
          RETURNING id, symbol, side, trade_date, entry_price, quantity, risk_amount, tags, is_open, status,
                    exit_price, exit_date, pl, pl_percent, r_multiple, outcome`,
        [
          session.workspaceId,
          journalEntryId,
          exitPrice,
          exitTsIso,
          pl,
          plPercent,
          rMultiple,
          outcome,
          closeSource,
          exitReason,
          followedPlan,
          notes,
        ]
      );

      const updated = updateRes.rows[0];
      const tags = Array.isArray(updated.tags) ? updated.tags : [];
      const packetId = parseDecisionPacketId(tags);

      const closeCompletedEventId = `evt_trade_close_completed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const closeRequestedEventId = `evt_trade_close_requested_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await client.query(
        `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
         VALUES
           ($1, 'trade.close.requested', $2::jsonb, $3::jsonb),
           ($1, 'trade.close.completed', $4::jsonb, $3::jsonb),
           ($1, 'label.outcome.created', $5::jsonb, $3::jsonb)`,
        [
          session.workspaceId,
          JSON.stringify({
            event_id: closeRequestedEventId,
            event_type: 'trade.close.requested',
            occurred_at: serverTsIso,
            payload: {
              trade_id: `trade_${journalEntryId}`,
              journal_entry_id: journalEntryId,
              symbol: updated.symbol,
              exit_intent_id: exitIntentId,
              exit_reason: exitReason,
              close_source: closeSource,
            },
          }),
          JSON.stringify({ route: '/api/journal/close-trade', module: 'journal_close' }),
          JSON.stringify({
            event_id: closeCompletedEventId,
            event_type: 'trade.close.completed',
            occurred_at: new Date().toISOString(),
            payload: {
              trade_id: `trade_${journalEntryId}`,
              journal_entry_id: journalEntryId,
              symbol: updated.symbol,
              exit_intent_id: exitIntentId,
              exit_reason: exitReason,
              close_source: closeSource,
              pnl: pl,
              r_multiple: rMultiple,
              return_pct: plPercent,
              outcome,
              followed_plan: followedPlan,
            },
          }),
          JSON.stringify({
            event_id: `evt_label_outcome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            event_type: 'label.outcome.created',
            occurred_at: new Date().toISOString(),
            payload: {
              trade_id: `trade_${journalEntryId}`,
              journal_entry_id: journalEntryId,
              symbol: updated.symbol,
              outcome,
              label_type: followedPlan === true ? (outcome === 'win' ? 'validated' : 'timing_issue') : 'ignored',
            },
          }),
        ]
      );

      if (packetId) {
        await client.query(
          `UPDATE decision_packets
              SET status = 'closed',
                  closed_event_id = $3,
                  last_event_id = $3,
                  last_event_type = 'decision_packet.status.changed',
                  updated_at = NOW()
            WHERE workspace_id = $1 AND packet_id = $2`,
          [session.workspaceId, packetId, closeCompletedEventId]
        );

        await client.query(
          `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
           VALUES ($1, 'decision_packet.status.changed', $2::jsonb, $3::jsonb)`,
          [
            session.workspaceId,
            JSON.stringify({
              event_id: `evt_dp_status_changed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              event_type: 'decision_packet.status.changed',
              occurred_at: new Date().toISOString(),
              payload: {
                decision_packet_id: packetId,
                from_status: 'executed',
                to_status: 'closed',
                trade_id: `trade_${journalEntryId}`,
                reason: exitReason,
              },
            }),
            JSON.stringify({ route: '/api/journal/close-trade', module: 'journal_close' }),
          ]
        );
      }

      await client.query(
        `UPDATE journal_exit_intents
            SET status = 'completed', completed_at = NOW()
          WHERE workspace_id = $1 AND journal_entry_id = $2 AND exit_intent_id = $3`,
        [session.workspaceId, journalEntryId, exitIntentId]
      );

      return {
        ok: true,
        updated,
        exitIntentId,
        packetId,
      } as const;
    });

    if ('notFound' in result) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    if ('alreadyClosed' in result) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        message: 'Trade already closed',
        exitIntentId: result.exitIntentId,
      });
    }

    await enqueueEngineJob({
      workspaceId: session.workspaceId,
      jobType: 'coach.recompute',
      payload: { source: 'journal.close-trade', journalEntryId },
      dedupeKey: `coach_recompute_after_close_${journalEntryId}`,
      priority: 40,
      maxAttempts: 3,
    }).catch((error) => {
      console.warn('[journal/close-trade] failed to enqueue coach.recompute:', error);
    });

    await emitTradeLifecycleEvent({
      workspaceId: session.workspaceId,
      eventType: 'TRADE_CLOSED',
      aggregateId: `trade_${result.updated.id}`,
      dedupeKey: `trade_closed_${hashDedupeKey([
        session.workspaceId,
        result.updated.id,
        result.exitIntentId,
        closeSource,
        exitReason,
      ])}`,
      occurredAtIso: new Date().toISOString(),
      payload: {
        journalEntryId: result.updated.id,
        symbol: result.updated.symbol,
        side: result.updated.side,
        exitIntentId: result.exitIntentId,
        closeSource,
        exitReason,
        outcome: result.updated.outcome || 'breakeven',
        pl: parseNumber(result.updated.pl) ?? 0,
        plPercent: parseNumber(result.updated.pl_percent) ?? 0,
        rMultiple: parseNumber(result.updated.r_multiple),
        decisionPacketId: result.packetId || null,
      },
    }).catch((error) => {
      console.warn('[journal/close-trade] failed to emit TRADE_CLOSED event:', error);
    });

    return NextResponse.json({
      success: true,
      exitIntentId: result.exitIntentId,
      decisionPacketId: result.packetId || null,
      entry: {
        id: result.updated.id,
        symbol: result.updated.symbol,
        side: result.updated.side,
        date: result.updated.trade_date,
        entryPrice: parseNumber(result.updated.entry_price) ?? 0,
        quantity: parseNumber(result.updated.quantity) ?? 0,
        exitPrice: parseNumber(result.updated.exit_price) ?? 0,
        exitDate: result.updated.exit_date || null,
        pl: parseNumber(result.updated.pl) ?? 0,
        plPercent: parseNumber(result.updated.pl_percent) ?? 0,
        rMultiple: parseNumber(result.updated.r_multiple),
        outcome: result.updated.outcome || 'breakeven',
        isOpen: Boolean(result.updated.is_open),
        status: result.updated.status || 'CLOSED',
      },
    });
  } catch (error) {
    if (closeFailureContext.workspaceId && closeFailureContext.journalEntryId) {
      const dedupe = hashDedupeKey([
        closeFailureContext.workspaceId,
        closeFailureContext.journalEntryId,
        closeFailureContext.exitReason || 'manual',
        closeFailureContext.closeSource || 'manual',
        String(error instanceof Error ? error.message : error).slice(0, 200),
      ]);

      await emitTradeLifecycleEvent({
        workspaceId: closeFailureContext.workspaceId,
        eventType: 'TRADE_CLOSE_FAILED',
        aggregateId: `trade_${closeFailureContext.journalEntryId}`,
        dedupeKey: `trade_close_failed_${dedupe}`,
        occurredAtIso: new Date().toISOString(),
        payload: {
          journalEntryId: closeFailureContext.journalEntryId,
          symbol: closeFailureContext.symbol || null,
          exitReason: closeFailureContext.exitReason || 'manual',
          closeSource: closeFailureContext.closeSource || 'manual',
          error: error instanceof Error ? error.message : 'Unknown close-trade error',
        },
      }).catch((emitErr) => {
        console.warn('[journal/close-trade] failed to emit TRADE_CLOSE_FAILED event:', emitErr);
      });
    }

    console.error('[journal/close-trade] error:', error);
    return NextResponse.json({ error: 'Failed to close trade' }, { status: 500 });
  }
}
