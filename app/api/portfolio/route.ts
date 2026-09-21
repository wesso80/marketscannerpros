import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";
import { getRuntimeRiskSnapshotInput } from "@/lib/risk/runtimeSnapshot";
import { buildPermissionSnapshot } from "@/lib/risk-governor-hard";

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
  basis: 'account_equity_v2' | 'legacy_position_value';
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

    // Ensure journal_entry_id column exists
    try {
      await q(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER`);
      await q(`ALTER TABLE portfolio_closed ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER`);
    } catch { /* columns may already exist */ }

    // Fetch open positions
    const positionsRaw = await q(
      `SELECT id, symbol, side, quantity, entry_price, current_price, entry_date, journal_entry_id
       FROM portfolio_positions 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    // Fetch closed positions
    const closedRaw = await q(
      `SELECT id, symbol, side, quantity, entry_price, close_price, entry_date, close_date, realized_pl, journal_entry_id
       FROM portfolio_closed 
       WHERE workspace_id = $1 
       ORDER BY close_date DESC`,
      [workspaceId]
    );

    // Snapshot basis was introduced after legacy rows had already been written as
    // open-position market value. Keep those rows for recordkeeping but never mix
    // them into account-equity risk analytics.
    try {
      await q(`ALTER TABLE portfolio_performance ADD COLUMN IF NOT EXISTS snapshot_basis TEXT`);
    } catch { /* column may already exist */ }

    // Fetch performance history
    const performanceRaw = await q(
      `SELECT snapshot_date, total_value, total_pl, snapshot_basis
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
        entryDate: p.entry_date,
        journalEntryId: p.journal_entry_id || undefined,
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
        closeDate: p.close_date,
        journalEntryId: p.journal_entry_id || undefined,
      };
    });

    const performanceHistory: PerformanceSnapshot[] = performanceRaw.map((p: any) => ({
      timestamp: p.snapshot_date,
      totalValue: parseFloat(p.total_value),
      totalPL: parseFloat(p.total_pl),
      basis: p.snapshot_basis === 'account_equity_v2' ? 'account_equity_v2' : 'legacy_position_value',
    }));

    // Compute portfolio risk analytics from daily snapshots
    let riskAnalytics: {
      dailySharpe: number;
      annualizedSharpe: number;
      var95: number;
      maxDrawdown: number;
      currentDrawdown: number;
      avgDailyReturn: number;
      dailyVolatility: number;
    } | null = null;

    const riskHistory = performanceHistory
      .filter((snapshot) => snapshot.basis === 'account_equity_v2' && Number.isFinite(snapshot.totalValue) && snapshot.totalValue > 0);

    if (riskHistory.length >= 5) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < riskHistory.length; i++) {
        const prev = riskHistory[i - 1].totalValue;
        const curr = riskHistory[i].totalValue;
        if (prev > 0) dailyReturns.push(((curr - prev) / prev) * 100);
      }
      if (dailyReturns.length >= 3) {
        const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const stdDev = Math.sqrt(
          dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
        );
        const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
        const var95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)] ?? 0;
        let peak = riskHistory[0].totalValue;
        let maxDD = 0;
        for (const snap of riskHistory) {
          if (snap.totalValue > peak) peak = snap.totalValue;
          const dd = peak > 0 ? ((peak - snap.totalValue) / peak) * 100 : 0;
          if (dd > maxDD) maxDD = dd;
        }
        const latestEquity = riskHistory[riskHistory.length - 1].totalValue;
        const currentDrawdown = peak > 0 ? ((peak - latestEquity) / peak) * 100 : 0;
        riskAnalytics = {
          dailySharpe: stdDev > 0 ? avgReturn / stdDev : 0,
          annualizedSharpe: stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0,
          var95: Math.abs(var95),
          maxDrawdown: maxDD,
          currentDrawdown,
          avgDailyReturn: avgReturn,
          dailyVolatility: stdDev,
        };
      }
    }

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

    return NextResponse.json({
      positions,
      closedPositions,
      performanceHistory,
      cashState,
      riskAnalytics,
      riskAnalyticsMeta: {
        basis: 'account_equity_v2',
        cleanSnapshots: riskHistory.length,
        requiredSnapshots: 5,
        status: riskAnalytics ? 'READY' : 'INSUFFICIENT_CLEAN_HISTORY',
        note: riskAnalytics
          ? 'Risk statistics use full account-equity snapshots only.'
          : 'Risk statistics are withheld until at least 5 account-equity snapshots exist; legacy position-value rows are excluded.',
      },
    });
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

    // ─── Risk Governor check: BLOCK if LOCKED, warn if DEFENSIVE ───
    let riskWarning: string | null = null;
    try {
      const existingPositions = await q(
        `SELECT symbol FROM portfolio_positions WHERE workspace_id = $1`,
        [workspaceId]
      );
      const existingSymbols = new Set(existingPositions.map((r: any) => r.symbol));
      const newPositions = (positions || []).filter((p: any) => !existingSymbols.has(p.symbol));

      if (newPositions.length > 0) {
        const guardCookie = req.cookies.get('msp_risk_guard')?.value;
        if (guardCookie !== 'off') {
          const riskInput = await getRuntimeRiskSnapshotInput(workspaceId);
          const snapshot = buildPermissionSnapshot({ enabled: true, ...riskInput });
          if (snapshot.risk_mode === 'LOCKED') {
            return NextResponse.json(
              { error: 'Risk governor is LOCKED — new paper positions are disabled. Close existing positions or wait for daily reset.', riskMode: 'LOCKED' },
              { status: 403 }
            );
          } else if (snapshot.risk_mode === 'DEFENSIVE') {
            riskWarning = 'Risk governor is DEFENSIVE — reduced sizing enforced for new entries.';
          }
        }
      }
    } catch { /* risk check fallback: allow sync for data integrity */ }

    // Clear existing manual entries (preserve journal-linked rows)
    await q(`DELETE FROM portfolio_positions WHERE workspace_id = $1 AND (journal_entry_id IS NULL)`, [workspaceId]);
    await q(`DELETE FROM portfolio_closed WHERE workspace_id = $1 AND (journal_entry_id IS NULL)`, [workspaceId]);
    await q(`DELETE FROM portfolio_performance WHERE workspace_id = $1`, [workspaceId]);

    // Insert manual positions (skip journal-linked ones — they're preserved)
    for (const p of positions || []) {
      if (p.journalEntryId) continue;
      await q(
        `INSERT INTO portfolio_positions (workspace_id, symbol, side, quantity, entry_price, current_price, entry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.currentPrice, p.entryDate || new Date().toISOString()]
      );
    }

    // Insert manual closed positions (skip journal-linked ones)
    for (const p of closedPositions || []) {
      if (p.journalEntryId) continue;
      await q(
        `INSERT INTO portfolio_closed (workspace_id, symbol, side, quantity, entry_price, close_price, entry_date, close_date, realized_pl)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.closePrice || p.currentPrice, p.entryDate, p.closeDate, p.realizedPL || p.pl]
      );
    }

    // Insert performance snapshots. Only rows explicitly produced by the new
    // account-equity model are eligible for risk analytics.
    try {
      await q(`ALTER TABLE portfolio_performance ADD COLUMN IF NOT EXISTS snapshot_basis TEXT`);
    } catch { /* column may already exist */ }
    for (const p of performanceHistory || []) {
      const date = new Date(p.timestamp).toISOString().split('T')[0];
      const basis = p.basis === 'account_equity_v2' ? 'account_equity_v2' : 'legacy_position_value';
      await q(
        `INSERT INTO portfolio_performance (workspace_id, snapshot_date, total_value, total_pl, snapshot_basis)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, snapshot_date) DO UPDATE
         SET total_value = $3, total_pl = $4, snapshot_basis = $5`,
        [workspaceId, date, p.totalValue, p.totalPL, basis]
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

    return NextResponse.json({ success: true, riskWarning });
  } catch (error) {
    console.error("Portfolio POST error:", error);
    return NextResponse.json({ error: "Failed to save portfolio" }, { status: 500 });
  }
}

// DELETE - Remove a single position (active or closed) by id.
// Body: { id: number, kind?: 'active' | 'closed' }
// Unlike the POST wipe-and-replace path, this hard-deletes the row even
// when it carries a journal_entry_id (the journal entry itself is left
// untouched — only the portfolio mirror row is removed).
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    let body: { id?: number; kind?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
    }
    const kind = body.kind === 'closed' ? 'closed' : 'active';
    const table = kind === 'closed' ? 'portfolio_closed' : 'portfolio_positions';

    const result = await q(
      `DELETE FROM ${table} WHERE workspace_id = $1 AND id = $2 RETURNING id`,
      [workspaceId, id]
    );
    return NextResponse.json({ success: true, deleted: result.length });
  } catch (error) {
    console.error("Portfolio DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete position" }, { status: 500 });
  }
}
