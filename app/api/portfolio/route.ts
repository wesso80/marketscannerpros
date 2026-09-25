import { NextRequest, NextResponse } from "next/server";
import { q, tx } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";
import { getRuntimeRiskSnapshotInput } from "@/lib/risk/runtimeSnapshot";
import { buildPermissionSnapshot } from "@/lib/risk-governor-hard";

import { computePortfolioRisk, type ExternalFlow } from '@/lib/portfolio/riskAnalytics';
import { positionUnits } from '@/lib/portfolio/positionValue';
import { normalizeExpiration } from '@/lib/options/contractQuote';

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
      `SELECT p.id, p.symbol, p.side, p.quantity, p.entry_price, p.current_price, p.entry_date, p.journal_entry_id,
              j.trade_type, j.asset_class, j.option_type, j.strike_price, j.expiration_date
       FROM portfolio_positions p
       LEFT JOIN journal_entries j ON j.id = p.journal_entry_id AND j.workspace_id = p.workspace_id
       WHERE p.workspace_id = $1
       ORDER BY p.created_at DESC`,
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
      // Option prices are premium per share: value/P&L use the contract multiplier.
      const units = positionUnits({ quantity: qty, tradeType: p.trade_type || undefined });
      const pl = p.side === 'LONG' 
        ? (current - entry) * units 
        : (entry - current) * units;
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
        tradeType: p.trade_type || undefined,
        assetClass: p.asset_class || undefined,
        ...(p.trade_type === 'Options' ? {
          optionType: p.option_type || undefined,
          strikePrice: p.strike_price != null ? parseFloat(p.strike_price) : undefined,
          expirationDate: normalizeExpiration(p.expiration_date) ?? undefined,
        } : {}),
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
        tradeType: p.trade_type || undefined,
        assetClass: p.asset_class || undefined,
      };
    });

    const performanceHistory: PerformanceSnapshot[] = performanceRaw.map((p: any) => ({
      timestamp: p.snapshot_date,
      totalValue: parseFloat(p.total_value),
      totalPL: parseFloat(p.total_pl),
      basis: p.snapshot_basis === 'account_equity_v2' ? 'account_equity_v2' : 'legacy_position_value',
    }));

    const riskHistory = performanceHistory.filter(snapshot => snapshot.basis === 'account_equity_v2');
    let cashFlowsForRisk: ExternalFlow[] | null = null;
    try {
      cashFlowsForRisk = await q<ExternalFlow>(
        `SELECT effective_date, entry_type, amount FROM portfolio_cash_ledger
         WHERE workspace_id = $1 AND entry_type IN ('deposit', 'withdrawal') ORDER BY effective_date ASC`, [workspaceId],
      );
    } catch { /* Unknown cash flows cannot be treated as zero. */ }
    const riskAnalytics = computePortfolioRisk(performanceHistory, cashFlowsForRisk);

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
          ? `Flow-adjusted daily account-equity estimates (${riskAnalytics.observations} returns). Cash flows are treated at UTC day end; large intraday flows require valuations around the flow. Annualization uses 365.25 calendar days and zero risk-free rate. VaR needs 20 returns; short samples are descriptive, not calibrated risk estimates.`
          : 'Risk statistics require at least 5 consecutive daily account-equity snapshots, positive capital, and known cash flows; legacy position-value rows are excluded.',
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
    if (!Array.isArray(positions) || !Array.isArray(closedPositions) || !Array.isArray(performanceHistory)
      || !cashState || !Number.isFinite(cashState.startingCapital) || cashState.startingCapital < 0 || !Array.isArray(cashState.cashLedger)) {
      return NextResponse.json({ error: 'A complete portfolio and valid cash state are required.' }, { status: 400 });
    }
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    const validPosition = (p: any) => p && typeof p.symbol === 'string' && p.symbol.trim() && ['LONG', 'SHORT'].includes(p.side)
      && finite(p.quantity) && p.quantity > 0 && finite(p.entryPrice) && p.entryPrice > 0
      && finite(p.currentPrice) && p.currentPrice >= 0 && Number.isFinite(Date.parse(p.entryDate));
    if (!positions.every(validPosition) || !closedPositions.every((p: any) => validPosition(p)
      && finite(p.closePrice) && p.closePrice >= 0 && finite(p.realizedPL) && Number.isFinite(Date.parse(p.closeDate)))
      || !performanceHistory.every((p: any) => p && Number.isFinite(Date.parse(p.timestamp)) && finite(p.totalValue) && finite(p.totalPL))
      || !cashState.cashLedger.every((f: any) => f && ['deposit', 'withdrawal'].includes(f.type) && finite(f.amount) && f.amount > 0 && Number.isFinite(Date.parse(f.timestamp)))) {
      return NextResponse.json({ error: 'Invalid position, performance snapshot or cash flow. No records were changed.' }, { status: 400 });
    }

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

    await tx(async (client) => {
      // Serialize replacements for this workspace; an insert failure rolls back all deletes.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [workspaceId]);
      const q = async (sql: string, params: any[] = []) => (await client.query(sql, params)).rows;
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
          [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.closePrice ?? p.currentPrice, p.entryDate, p.closeDate, p.realizedPL ?? p.pl]
        );
      }

      // Insert performance snapshots. Only rows explicitly produced by the new
      // account-equity model are eligible for risk analytics.
      await q(`ALTER TABLE portfolio_performance ADD COLUMN IF NOT EXISTS snapshot_basis TEXT`);
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

      {
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
      }

    });

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
