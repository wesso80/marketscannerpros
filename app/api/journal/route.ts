import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { tx } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";
import { emitTradeLifecycleEvent, hashDedupeKey } from "@/lib/notifications/tradeEvents";

interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  tradeType: 'Spot' | 'Options' | 'Futures' | 'Margin';
  optionType?: 'Call' | 'Put';
  strikePrice?: number;
  expirationDate?: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  stopLoss?: number;
  target?: number;
  riskAmount?: number;
  rMultiple?: number;
  plannedRR?: number;
  pl: number;
  plPercent: number;
  strategy: string;
  setup: string;
  notes: string;
  emotions: string;
  outcome: 'win' | 'loss' | 'breakeven' | 'open';
  tags: string[];
  isOpen: boolean;
  exitDate?: string;
  status?: 'OPEN' | 'MANAGING' | 'EXIT_PENDING' | 'CLOSED' | 'FAILED_EXIT';
  closeSource?: 'manual' | 'mark' | 'broker';
  exitReason?: 'tp' | 'sl' | 'manual' | 'time' | 'invalidated';
  followedPlan?: boolean;
  exitIntentId?: string;
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
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS close_source VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS followed_plan BOOLEAN`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_intent_id VARCHAR(120)`);
}

// GET - Load journal entries
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;

    await ensureJournalSchema();

    const entriesRaw = await q(
      `SELECT *
       FROM journal_entries 
       WHERE workspace_id = $1 
       ORDER BY trade_date DESC, created_at DESC`,
      [workspaceId]
    );

    const entries: JournalEntry[] = entriesRaw.map((e: any) => ({
      id: e.id,
      date: e.trade_date,
      symbol: e.symbol,
      side: e.side,
      tradeType: e.trade_type,
      optionType: e.option_type || undefined,
      strikePrice: e.strike_price ? parseFloat(e.strike_price) : undefined,
      expirationDate: e.expiration_date || undefined,
      entryPrice: parseFloat(e.entry_price),
      exitPrice: e.exit_price ? parseFloat(e.exit_price) : 0,
      quantity: parseFloat(e.quantity),
      stopLoss: e.stop_loss ? parseFloat(e.stop_loss) : undefined,
      target: e.target ? parseFloat(e.target) : undefined,
      riskAmount: e.risk_amount ? parseFloat(e.risk_amount) : undefined,
      rMultiple: e.r_multiple ? parseFloat(e.r_multiple) : undefined,
      plannedRR: e.planned_rr ? parseFloat(e.planned_rr) : undefined,
      pl: e.pl ? parseFloat(e.pl) : 0,
      plPercent: e.pl_percent ? parseFloat(e.pl_percent) : 0,
      strategy: e.strategy || '',
      setup: e.setup || '',
      notes: e.notes || '',
      emotions: e.emotions || '',
      outcome: e.outcome || 'open',
      tags: e.tags || [],
      isOpen: e.is_open,
      exitDate: e.exit_date || undefined,
      status: e.status || (e.is_open ? 'OPEN' : 'CLOSED'),
      closeSource: e.close_source || undefined,
      exitReason: e.exit_reason || undefined,
      followedPlan: typeof e.followed_plan === 'boolean' ? e.followed_plan : undefined,
      exitIntentId: e.exit_intent_id || undefined,
    }));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Journal GET error:", error);
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}

// POST - Save journal entries
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();
    const { entries } = body;

    await ensureJournalSchema();

    const incomingEntries = Array.isArray(entries) ? entries : [];

    // Clear and re-insert atomically to avoid transient not-found windows during close requests.
    await tx(async (client) => {
      const existingIdRows = await client.query<{ id: number }>(
        `SELECT id FROM journal_entries WHERE workspace_id = $1`,
        [workspaceId]
      );
      const existingWorkspaceIds = new Set(existingIdRows.rows.map((row) => Number(row.id)));

      const dedupedEntries = new Map<string, any>();
      for (const rawEntry of incomingEntries) {
        const numericId = Number(rawEntry?.id);
        const canPreserveStableId =
          Number.isInteger(numericId) &&
          numericId > 0 &&
          existingWorkspaceIds.has(numericId);

        const dedupeKey = canPreserveStableId
          ? `id:${numericId}`
          : [
              'synthetic',
              String(rawEntry?.symbol || '').toUpperCase(),
              String(rawEntry?.date || ''),
              String(rawEntry?.side || ''),
              String(rawEntry?.entryPrice || ''),
              String(rawEntry?.quantity || ''),
              String(rawEntry?.strategy || ''),
              String(rawEntry?.setup || ''),
            ].join(':');

        dedupedEntries.set(dedupeKey, {
          ...rawEntry,
          __stableId: canPreserveStableId ? numericId : null,
        });
      }

      await client.query(`DELETE FROM journal_entries WHERE workspace_id = $1`, [workspaceId]);

      for (const e of dedupedEntries.values()) {
        const stableId = typeof e?.__stableId === 'number' ? e.__stableId : null;
        const hasStableId = Number.isInteger(stableId) && stableId > 0;

        const columns = [
          'workspace_id', 'trade_date', 'symbol', 'side', 'trade_type', 'option_type', 'strike_price',
          'expiration_date', 'quantity', 'entry_price', 'exit_price', 'exit_date', 'pl', 'pl_percent',
          'strategy', 'setup', 'notes', 'emotions', 'outcome', 'tags', 'is_open',
          'stop_loss', 'target', 'risk_amount', 'r_multiple', 'planned_rr',
          'status', 'close_source', 'exit_reason', 'followed_plan', 'exit_intent_id'
        ];

        const values: any[] = [
          workspaceId,
          e.date,
          e.symbol,
          e.side,
          e.tradeType,
          e.optionType || null,
          e.strikePrice || null,
          e.expirationDate || null,
          e.quantity,
          e.entryPrice,
          e.exitPrice || null,
          e.exitDate || null,
          e.pl || null,
          e.plPercent || null,
          e.strategy || null,
          e.setup || null,
          e.notes || null,
          e.emotions || null,
          e.outcome || 'open',
          e.tags || [],
          e.isOpen !== false,
          e.stopLoss || null,
          e.target || null,
          e.riskAmount || null,
          e.rMultiple || null,
          e.plannedRR || null,
          e.status || (e.isOpen !== false ? 'OPEN' : 'CLOSED'),
          e.closeSource || null,
          e.exitReason || null,
          typeof e.followedPlan === 'boolean' ? e.followedPlan : null,
          e.exitIntentId || null,
        ];

        if (hasStableId) {
          columns.unshift('id');
          values.unshift(stableId);
        }

        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

        await client.query(
          `INSERT INTO journal_entries (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );

        if (e?.isOpen !== false) {
          const symbol = String(e?.symbol || '').toUpperCase().slice(0, 20);
          const side = String(e?.side || 'LONG').toUpperCase();
          const quantity = Number(e?.quantity || 0);
          const entryPrice = Number(e?.entryPrice || 0);
          const tradeDate = String(e?.date || '');

          if (symbol && Number.isFinite(quantity) && Number.isFinite(entryPrice) && tradeDate) {
            const fingerprint = hashDedupeKey([
              'TRADE_ENTERED',
              workspaceId,
              symbol,
              side,
              tradeDate,
              quantity,
              entryPrice,
            ]);

            await emitTradeLifecycleEvent({
              workspaceId,
              eventType: 'TRADE_ENTERED',
              aggregateId: `trade_${symbol}_${tradeDate}_${fingerprint.slice(0, 12)}`,
              dedupeKey: `trade_entered_${fingerprint}`,
              payload: {
                symbol,
                side,
                tradeDate,
                quantity,
                entryPrice,
                strategy: e?.strategy || null,
                setup: e?.setup || null,
                source: 'journal_sync',
              },
            }).catch((error) => {
              console.warn('[journal] failed to emit TRADE_ENTERED event:', error);
            });
          }
        }
      }

      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('journal_entries', 'id'),
          GREATEST(COALESCE((SELECT MAX(id) FROM journal_entries), 1), 1),
          true
        )
      `);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Journal POST error:", error);
    return NextResponse.json({ error: "Failed to save journal" }, { status: 500 });
  }
}
