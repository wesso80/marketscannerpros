import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";

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
}

// GET - Load journal entries
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;

    const entriesRaw = await q(
      `SELECT id, trade_date, symbol, side, trade_type, option_type, strike_price, expiration_date,
              quantity, entry_price, exit_price, exit_date, pl, pl_percent, strategy, setup, 
              notes, emotions, outcome, tags, is_open,
              stop_loss, target, risk_amount, r_multiple, planned_rr
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
      exitDate: e.exit_date || undefined
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

    // Clear existing and insert new (simple sync approach)
    await q(`DELETE FROM journal_entries WHERE workspace_id = $1`, [workspaceId]);

    // Insert entries
    for (const e of entries || []) {
      await q(
        `INSERT INTO journal_entries (
          workspace_id, trade_date, symbol, side, trade_type, option_type, strike_price, 
          expiration_date, quantity, entry_price, exit_price, exit_date, pl, pl_percent, 
          strategy, setup, notes, emotions, outcome, tags, is_open,
          stop_loss, target, risk_amount, r_multiple, planned_rr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
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
          e.plannedRR || null
        ]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Journal POST error:", error);
    return NextResponse.json({ error: "Failed to save journal" }, { status: 500 });
  }
}
