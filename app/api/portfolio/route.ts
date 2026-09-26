import { NextRequest, NextResponse } from "next/server";
import { q, tx } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";
import { getRuntimeRiskSnapshotInput } from "@/lib/risk/runtimeSnapshot";
import { buildPermissionSnapshot } from "@/lib/risk-governor-hard";

import { computePortfolioRisk, type ExternalFlow } from '@/lib/portfolio/riskAnalytics';
import { positionUnits } from '@/lib/portfolio/positionValue';
import { normalizeExpiration } from '@/lib/options/contractQuote';
import { readServerPortfolioState, replacePortfolio, sqlErrorCode, type SyncProgress } from '@/lib/portfolio/serverSync';

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

function positiveOrNull(value: unknown): number | null {
  const n = value == null ? NaN : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
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
              j.trade_type, j.asset_class, j.option_type, j.strike_price, j.expiration_date,
              j.stop_loss, j.target
       FROM portfolio_positions p
       LEFT JOIN journal_entries j ON j.id = p.journal_entry_id AND j.workspace_id = p.workspace_id
       WHERE p.workspace_id = $1
       ORDER BY p.created_at DESC`,
      [workspaceId]
    );

    // Fetch closed positions
    const closedRaw = await q(
      `SELECT c.id, c.symbol, c.side, c.quantity, c.entry_price, c.close_price, c.entry_date, c.close_date, c.realized_pl, c.journal_entry_id,
              j.trade_type, j.asset_class, j.r_multiple, j.stop_loss
       FROM portfolio_closed c
       LEFT JOIN journal_entries j ON j.id = c.journal_entry_id AND j.workspace_id = c.workspace_id
       WHERE c.workspace_id = $1
       ORDER BY c.close_date DESC`,
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
        // Journal-linked positions show the journal entry's stop/target (read-only on the Portfolio page).
        ...(p.journal_entry_id ? {
          stopPrice: positiveOrNull(p.stop_loss),
          targetPrice: positiveOrNull(p.target),
        } : {}),
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
        // Trade type from the linked journal entry (options closes use the x100 contract multiplier).
        tradeType: p.trade_type || undefined,
        assetClass: p.asset_class || undefined,
        // R (P&L / risk to the recorded stop) from the linked journal entry, only when it has a stop.
        ...(p.journal_entry_id && positiveOrNull(p.stop_loss) != null && Number.isFinite(parseFloat(p.r_multiple))
          ? { rMultiple: parseFloat(p.r_multiple), stopPrice: positiveOrNull(p.stop_loss) }
          : {}),
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

    // Fingerprint of what a POST would replace. The client must send it back with its next POST;
    // if the server copy has changed in between, the POST is refused instead of overwriting it.
    let syncRevision: string | null = null;
    try {
      syncRevision = (await tx((client) => readServerPortfolioState(client, workspaceId))).revision;
    } catch (revisionError) {
      console.warn('Portfolio GET: sync revision unavailable; client will not sync this session', sqlErrorCode(revisionError) ?? '');
    }

    return NextResponse.json({
      positions,
      closedPositions,
      performanceHistory,
      cashState,
      syncRevision,
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
  const progress: SyncProgress = { stage: 'start' };
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

    const result = await tx((client) => replacePortfolio(
      client,
      workspaceId,
      { positions, closedPositions, performanceHistory, cashState },
      { baseRevision: body.baseRevision, confirmClear: body.confirmClear },
      progress,
    ));

    if (result.status === 'conflict') {
      const message = result.reason === 'empty_overwrite'
        ? 'Refusing to replace saved portfolio data with an empty portfolio. No records were changed.'
        : 'The saved portfolio changed since this page loaded (another tab or device). Reload to get the latest. No records were changed.';
      return NextResponse.json({ error: message, conflict: result.reason, syncRevision: result.revision }, { status: 409 });
    }

    return NextResponse.json({ success: true, riskWarning, syncRevision: result.revision, cashStateSaved: result.cashStateSaved });
  } catch (error) {
    const code = sqlErrorCode(error);
    console.error("Portfolio POST error:", `stage=${progress.stage}`, `code=${code ?? 'none'}`, error);
    // Stage and SQLSTATE only (no data), so a failing sync can be diagnosed from the browser too.
    return NextResponse.json({ error: "Failed to save portfolio", stage: progress.stage, code: code ?? null }, { status: 500 });
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

    // Same lock as POST, and report the sync revision before/after so the page can tell its own
    // delete apart from a change made elsewhere.
    const result = await tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [workspaceId]);
      const before = await readServerPortfolioState(client, workspaceId);
      const deleted = (await client.query(
        `DELETE FROM ${table} WHERE workspace_id = $1 AND id = $2 RETURNING id`,
        [workspaceId, id]
      )).rows;
      const after = await readServerPortfolioState(client, workspaceId);
      return { deleted: deleted.length, previousRevision: before.revision, syncRevision: after.revision };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Portfolio DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete position" }, { status: 500 });
  }
}
