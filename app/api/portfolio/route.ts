import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";

interface Position {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pl: number;
  plPercent: number;
  entryDate: string;
}

interface ClosedPosition extends Position {
  closeDate: string;
  closePrice: number;
  realizedPL: number;
}

interface PerformanceSnapshot {
  timestamp: string;
  totalValue: number;
  totalPL: number;
}

interface CashLedgerEntry {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  timestamp: string;
  note?: string;
}

interface CashState {
  startingCapital: number;
  cashLedger: CashLedgerEntry[];
}

// GET - Load portfolio data
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({
        positions: [],
        closedPositions: [],
        performanceHistory: [],
        localOnly: true,
      });
    }

    const workspaceId = session.workspaceId;

    // Fetch open positions
    const positionsRaw = await q(
      `SELECT id, symbol, side, quantity, entry_price, current_price, entry_date 
       FROM portfolio_positions 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    // Fetch closed positions
    const closedRaw = await q(
      `SELECT id, symbol, side, quantity, entry_price, close_price, entry_date, close_date, realized_pl
       FROM portfolio_closed 
       WHERE workspace_id = $1 
       ORDER BY close_date DESC`,
      [workspaceId]
    );

    // Fetch performance history
    const performanceRaw = await q(
      `SELECT snapshot_date, total_value, total_pl 
       FROM portfolio_performance 
       WHERE workspace_id = $1 
       ORDER BY snapshot_date ASC`,
      [workspaceId]
    );

    // Transform to frontend format
    const positions: Position[] = positionsRaw.map((p: any) => {
      const qty = parseFloat(p.quantity);
      const entry = parseFloat(p.entry_price);
      const current = parseFloat(p.current_price);
      const pl = p.side === 'LONG' 
        ? (current - entry) * qty 
        : (entry - current) * qty;
      const plPercent = ((current - entry) / entry) * 100 * (p.side === 'LONG' ? 1 : -1);

      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        quantity: qty,
        entryPrice: entry,
        currentPrice: current,
        pl,
        plPercent,
        entryDate: p.entry_date
      };
    });

    const closedPositions: ClosedPosition[] = closedRaw.map((p: any) => {
      const qty = parseFloat(p.quantity);
      const entry = parseFloat(p.entry_price);
      const close = parseFloat(p.close_price);
      const realizedPL = parseFloat(p.realized_pl);
      const plPercent = ((close - entry) / entry) * 100 * (p.side === 'LONG' ? 1 : -1);

      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        quantity: qty,
        entryPrice: entry,
        currentPrice: close,
        closePrice: close,
        pl: realizedPL,
        plPercent,
        realizedPL,
        entryDate: p.entry_date,
        closeDate: p.close_date
      };
    });

    const performanceHistory: PerformanceSnapshot[] = performanceRaw.map((p: any) => ({
      timestamp: p.snapshot_date,
      totalValue: parseFloat(p.total_value),
      totalPL: parseFloat(p.total_pl)
    }));

    let cashState: CashState | null = null;
    try {
      const cashRows = await q(
        `SELECT id, entry_type, amount, effective_date, note
         FROM portfolio_cash_ledger
         WHERE workspace_id = $1
         ORDER BY effective_date ASC, created_at ASC`,
        [workspaceId]
      );

      if (cashRows.length > 0) {
        const startingRow = cashRows.find((row: any) => row.entry_type === 'starting_capital');
        const startingCapital = startingRow ? parseFloat(startingRow.amount) : 10000;
        const cashLedger: CashLedgerEntry[] = cashRows
          .filter((row: any) => row.entry_type === 'deposit' || row.entry_type === 'withdrawal')
          .map((row: any) => ({
            id: String(row.id),
            type: row.entry_type,
            amount: parseFloat(row.amount),
            timestamp: row.effective_date,
            note: row.note || undefined,
          }));
        cashState = { startingCapital, cashLedger };
      }
    } catch (cashError) {
      console.warn('portfolio_cash_ledger table not available yet; continuing without persisted cash state');
    }

    return NextResponse.json({ positions, closedPositions, performanceHistory, cashState });
  } catch (error) {
    console.error("Portfolio GET error:", error);
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}

// POST - Save portfolio data
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: true, localOnly: true });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();
    const { positions, closedPositions, performanceHistory, cashState } = body;

    // Clear existing and insert new (simple sync approach)
    await q(`DELETE FROM portfolio_positions WHERE workspace_id = $1`, [workspaceId]);
    await q(`DELETE FROM portfolio_closed WHERE workspace_id = $1`, [workspaceId]);
    await q(`DELETE FROM portfolio_performance WHERE workspace_id = $1`, [workspaceId]);

    // Insert positions
    for (const p of positions || []) {
      await q(
        `INSERT INTO portfolio_positions (workspace_id, symbol, side, quantity, entry_price, current_price, entry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.currentPrice, p.entryDate || new Date().toISOString()]
      );
    }

    // Insert closed positions
    for (const p of closedPositions || []) {
      await q(
        `INSERT INTO portfolio_closed (workspace_id, symbol, side, quantity, entry_price, close_price, entry_date, close_date, realized_pl)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.closePrice || p.currentPrice, p.entryDate, p.closeDate, p.realizedPL || p.pl]
      );
    }

    // Insert performance snapshots
    for (const p of performanceHistory || []) {
      const date = new Date(p.timestamp).toISOString().split('T')[0];
      await q(
        `INSERT INTO portfolio_performance (workspace_id, snapshot_date, total_value, total_pl)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, snapshot_date) DO UPDATE SET total_value = $3, total_pl = $4`,
        [workspaceId, date, p.totalValue, p.totalPL]
      );
    }

    try {
      await q(`DELETE FROM portfolio_cash_ledger WHERE workspace_id = $1`, [workspaceId]);

      const startingCapital = Number(cashState?.startingCapital);
      await q(
        `INSERT INTO portfolio_cash_ledger (workspace_id, entry_type, amount, effective_date, note)
         VALUES ($1, 'starting_capital', $2, $3, $4)`,
        [workspaceId, Number.isFinite(startingCapital) ? startingCapital : 10000, new Date().toISOString(), 'Configured starting capital']
      );

      for (const item of cashState?.cashLedger || []) {
        const entryType = item?.type === 'withdrawal' ? 'withdrawal' : 'deposit';
        const amount = Number(item?.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        await q(
          `INSERT INTO portfolio_cash_ledger (workspace_id, entry_type, amount, effective_date, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [workspaceId, entryType, amount, item?.timestamp || new Date().toISOString(), item?.note || null]
        );
      }
    } catch (cashError) {
      console.warn('Failed to persist portfolio cash state (table may not exist yet)');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Portfolio POST error:", error);
    return NextResponse.json({ error: "Failed to save portfolio" }, { status: 500 });
  }
}
