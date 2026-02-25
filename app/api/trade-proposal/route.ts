import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { randomUUID } from 'crypto';

import {
  type TradeIntent,
  type TradeProposal,
  validateIntent,
  validateProposal,
  buildExitPlan,
  computePositionSize,
  computeLeverage,
  selectOptions,
  buildOrder,
} from '@/lib/execution';
import { evaluateGovernor } from '@/lib/execution/riskGovernor';
import { getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';
import { q } from '@/lib/db';

/**
 * POST /api/trade-proposal
 *
 * Receives a TradeIntent, runs every execution-engine module, and returns
 * a full TradeProposal (the "Trade Decision Object").
 *
 * Does NOT execute or write to journal — that's /api/execute-trade.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const intent: TradeIntent = {
      symbol: String(body.symbol ?? '').toUpperCase().trim(),
      asset_class: body.asset_class ?? body.assetClass ?? 'equity',
      direction: String(body.direction ?? '').toUpperCase() as TradeIntent['direction'],
      strategy_tag: body.strategy_tag ?? body.strategyTag ?? 'TREND_PULLBACK',
      confidence: Number(body.confidence ?? 50),
      regime: body.regime ?? 'RANGE_NEUTRAL',
      entry_price: Number(body.entry_price ?? body.entryPrice ?? 0),
      atr: Number(body.atr ?? 0),
      stop_price: body.stop_price != null ? Number(body.stop_price) : undefined,
      event_severity: body.event_severity,
      options_dte: body.options_dte != null ? Number(body.options_dte) : undefined,
      options_delta: body.options_delta != null ? Number(body.options_delta) : undefined,
      options_structure: body.options_structure,
      account_equity: body.account_equity != null ? Number(body.account_equity) : undefined,
      risk_pct: body.risk_pct != null ? Number(body.risk_pct) : undefined,
      leverage: body.leverage != null ? Number(body.leverage) : undefined,
      open_positions: body.open_positions,
    };

    // ── 1. Validate intent ───────────────────────────────────────────
    const intentErrors = validateIntent(intent);
    if (intentErrors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid intent', validation_errors: intentErrors },
        { status: 400 },
      );
    }

    // ── 2. Resolve account equity if not provided ────────────────────
    if (!intent.account_equity) {
      const equity = await getLatestPortfolioEquity(session.workspaceId);
      intent.account_equity = equity ?? 100_000;
    }

    // ── 3. Resolve open positions for correlation check ──────────────
    if (!intent.open_positions) {
      const rows = await q<{ symbol: string; side: string; asset_class: string }>(
        `SELECT symbol, side, asset_class
           FROM journal_entries
          WHERE workspace_id = $1 AND is_open = true`,
        [session.workspaceId],
      );
      intent.open_positions = rows.map((r) => ({
        symbol: r.symbol,
        direction: r.side.toUpperCase() as TradeIntent['direction'],
        asset_class: (r.asset_class || 'equity') as TradeIntent['asset_class'],
      }));
    }

    // ── 4. Compute ATR % for leverage module ─────────────────────────
    const atrPct = intent.entry_price > 0
      ? (intent.atr / intent.entry_price) * 100
      : 2;

    // ── 5. Exit plan ─────────────────────────────────────────────────
    const exits = buildExitPlan({
      direction: intent.direction,
      entry_price: intent.entry_price,
      atr: intent.atr,
      asset_class: intent.asset_class,
      regime: intent.regime,
      strategy_tag: intent.strategy_tag,
      stop_override: intent.stop_price,
    });

    // ── 6. Governor ──────────────────────────────────────────────────
    // Get portfolio risk metrics for governor
    const dailyLossRows = await q<{ daily_loss: string }>(
      `SELECT COALESCE(SUM(pl), 0) AS daily_loss
         FROM journal_entries
        WHERE workspace_id = $1
          AND is_open = false
          AND exit_date::date = CURRENT_DATE`,
      [session.workspaceId],
    );
    const dailyLoss = Math.abs(Number(dailyLossRows[0]?.daily_loss ?? 0));
    const dailyLossPct = intent.account_equity > 0 ? dailyLoss / intent.account_equity : 0;

    const openTradeRows = await q<{ cnt: string; total_risk: string }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(risk_amount), 0)::text AS total_risk
         FROM journal_entries
        WHERE workspace_id = $1 AND is_open = true`,
      [session.workspaceId],
    );
    const openCount = Number(openTradeRows[0]?.cnt ?? 0);
    const portfolioHeat = intent.account_equity > 0
      ? Number(openTradeRows[0]?.total_risk ?? 0) / intent.account_equity
      : 0;

    const governor = await evaluateGovernor(intent, exits, {
      current_daily_loss_pct: dailyLossPct,
      current_portfolio_heat_pct: portfolioHeat,
      current_open_trade_count: openCount,
    });

    // ── 7. Leverage ──────────────────────────────────────────────────
    const leverage = computeLeverage({
      asset_class: intent.asset_class,
      regime: intent.regime,
      risk_mode: governor.risk_mode,
      atr_percent: atrPct,
      override_leverage: intent.leverage,
    });

    // ── 8. Position sizing ───────────────────────────────────────────
    const sizing = computePositionSize(intent, {
      governor_risk_per_trade: governor.risk_per_trade,
      governor_max_position_size: governor.max_position_size,
      effective_leverage: leverage.recommended_leverage,
    });

    // ── 9. Options (if applicable) ───────────────────────────────────
    let options = undefined;
    if (intent.asset_class === 'options' || intent.options_structure) {
      options = selectOptions({
        regime: intent.regime,
        direction: intent.direction,
        confidence: intent.confidence,
        entry_price: intent.entry_price,
        asset_class: intent.asset_class,
        risk_budget_usd: sizing.total_risk_usd,
        force_structure: intent.options_structure,
        force_dte: intent.options_dte,
        force_delta: intent.options_delta,
      });
    }

    // ── 10. Build order ──────────────────────────────────────────────
    const proposalId = randomUUID();
    const order = buildOrder({
      intent,
      sizing,
      exits,
      leverage,
      options,
      proposal_id: proposalId,
    });

    // ── 11. Assemble proposal ────────────────────────────────────────
    const proposal: TradeProposal = {
      proposal_id: proposalId,
      ts: new Date().toISOString(),
      intent,
      governor,
      sizing,
      exits,
      leverage,
      options,
      order,
      validation_errors: [],
      executable: false,
      summary: '',
    };

    // ── 12. Validate full proposal ───────────────────────────────────
    proposal.validation_errors = validateProposal(proposal);

    // Executable only if governor allows AND no blocking errors
    const blockingErrors = proposal.validation_errors.filter(
      (e) => !['HIGH_NOTIONAL'].includes(e.code),
    );
    proposal.executable = governor.allowed && blockingErrors.length === 0;

    // ── 13. Human summary ────────────────────────────────────────────
    proposal.summary = buildSummary(proposal);

    return NextResponse.json({ proposal });
  } catch (err: unknown) {
    console.error('[trade-proposal] Error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Summary builder                                                    */
/* ------------------------------------------------------------------ */

function buildSummary(p: TradeProposal): string {
  const parts: string[] = [];
  const dir = p.intent.direction;
  const sym = p.intent.symbol;
  const qty = p.sizing.quantity;
  const entry = p.intent.entry_price;
  const stop = p.exits.stop_price;
  const tp1 = p.exits.take_profit_1;

  parts.push(`${dir} ${sym} × ${qty} @ ${entry}`);
  parts.push(`Stop ${stop} → TP1 ${tp1}`);
  parts.push(`Risk $${p.sizing.total_risk_usd.toFixed(2)} (${(p.sizing.risk_pct * 100).toFixed(2)}%)`);
  parts.push(`R:R ${p.exits.rr_at_tp1}:1`);

  if (p.leverage.recommended_leverage > 1) {
    parts.push(`Leverage ${p.leverage.recommended_leverage}×`);
  }

  if (p.options) {
    parts.push(`Options: ${p.options.structure} ${p.options.dte}DTE ${(p.options.delta * 100).toFixed(0)}Δ`);
  }

  if (!p.executable) {
    const reasons = p.governor.reason_codes.length > 0
      ? p.governor.reason_codes.join(', ')
      : p.validation_errors.map((e) => e.code).join(', ');
    parts.push(`⛔ BLOCKED: ${reasons}`);
  } else {
    parts.push('✅ EXECUTABLE');
  }

  return parts.join(' | ');
}
