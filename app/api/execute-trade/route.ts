import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

import type { TradeProposal, ExecutionResult, ExecutionMode } from '@/lib/execution/types';
import { evaluateGovernor } from '@/lib/execution/riskGovernor';
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';

/**
 * POST /api/execute-trade
 *
 * Takes a validated TradeProposal, re-checks the governor, then persists
 * the trade to journal_entries.
 *
 * Mode:
 *   DRY_RUN  — validate only, return result without writing
 *   PAPER    — write to journal (no broker)
 *   LIVE     — write to journal + send to broker (stub for now)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();

    const proposal: TradeProposal = body.proposal;
    const mode: ExecutionMode = body.mode ?? 'DRY_RUN';

    if (!proposal?.proposal_id) {
      return NextResponse.json({ error: 'proposal is required' }, { status: 400 });
    }

    // ── 1. Re-check governor (prices may have moved since proposal) ──
    const governor = await evaluateGovernor(proposal.intent, proposal.exits);
    if (!governor.allowed && mode !== 'DRY_RUN') {
      const result: ExecutionResult = {
        proposal_id: proposal.proposal_id,
        mode,
        success: false,
        error: `Governor blocked at execution time: ${governor.reason_codes.join(', ')}`,
        ts: new Date().toISOString(),
      };
      return NextResponse.json({ result }, { status: 403 });
    }

    // ── 2. DRY_RUN → return immediately ──────────────────────────────
    if (mode === 'DRY_RUN') {
      const result: ExecutionResult = {
        proposal_id: proposal.proposal_id,
        mode,
        success: true,
        ts: new Date().toISOString(),
      };
      return NextResponse.json({ result, governor });
    }

    // ── 3. Compute immutable entry risk metrics ──────────────────────
    const equity = await getLatestPortfolioEquity(workspaceId);
    const riskMetrics = computeEntryRiskMetrics({
      equityAtEntry: equity ?? proposal.sizing.account_equity,
      dynamicRiskPerTrade: proposal.sizing.risk_pct,
    });

    // ── 4. Write to journal_entries ──────────────────────────────────
    const intent = proposal.intent;
    const exits = proposal.exits;
    const sizing = proposal.sizing;
    const order = proposal.order;

    const tradeDate = new Date().toISOString().slice(0, 10);
    const side = intent.direction;
    const assetClass = intent.asset_class === 'futures' || intent.asset_class === 'forex'
      ? 'equity'
      : intent.asset_class;

    // Determine trade type
    let tradeType = 'Spot';
    if (intent.asset_class === 'options') tradeType = 'Options';
    else if (intent.asset_class === 'futures') tradeType = 'Futures';
    else if ((proposal.leverage?.recommended_leverage ?? 1) > 1) tradeType = 'Margin';

    const rows = await q<{ id: number }>(
      `INSERT INTO journal_entries (
        workspace_id, trade_date, symbol, side, trade_type, asset_class,
        quantity, entry_price, stop_loss, target, risk_amount, planned_rr,
        strategy, setup, notes, outcome, tags, is_open, status,
        option_type, strike_price, expiration_date, premium, leverage,
        normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry
      ) VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,
        $7,  $8,  $9,  $10, $11, $12,
        $13, $14, $15, 'open', $16, true, 'OPEN',
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      ) RETURNING id`,
      [
        workspaceId,                                    // $1
        tradeDate,                                      // $2
        intent.symbol,                                  // $3
        side,                                           // $4
        tradeType,                                      // $5
        assetClass,                                     // $6
        sizing.quantity,                                // $7
        intent.entry_price,                             // $8
        exits.stop_price,                               // $9
        exits.take_profit_1,                            // $10
        sizing.total_risk_usd,                          // $11
        exits.rr_at_tp1,                                // $12
        intent.strategy_tag,                            // $13
        `Execution Engine — ${proposal.summary}`,       // $14 setup
        JSON.stringify({                                // $15 notes (structured)
          proposal_id: proposal.proposal_id,
          trail_rule: exits.trail_rule,
          time_stop_minutes: exits.time_stop_minutes,
          tp2: exits.take_profit_2,
          leverage: proposal.leverage,
          options: proposal.options ?? null,
          governor_codes: governor.reason_codes,
        }),
        intent.event_severity ? [intent.event_severity] : [],   // $16 tags
        proposal.options ? order.option_type : null,    // $17
        proposal.options?.strike ?? null,               // $18
        order.expiration ?? null,                       // $19
        proposal.options?.premium_est ?? null,          // $20
        proposal.leverage?.recommended_leverage ?? null, // $21
        riskMetrics.normalizedR,                        // $22
        riskMetrics.dynamicR,                           // $23
        riskMetrics.riskPerTradeAtEntry,                // $24
        riskMetrics.equityAtEntry,                      // $25
      ],
    );

    const journalEntryId = rows[0]?.id;

    // ── 5. LIVE mode → broker stub ───────────────────────────────────
    let brokerOrderId: string | undefined;
    if (mode === 'LIVE') {
      // TODO: wire real broker connector (Binance / IBKR / Phemex)
      // For now we log a placeholder
      console.log(`[execute-trade] LIVE mode — broker order would be sent:`, order);
      brokerOrderId = `SIM-${order.client_order_id}`;
    }

    const result: ExecutionResult = {
      proposal_id: proposal.proposal_id,
      mode,
      success: true,
      journal_entry_id: journalEntryId,
      broker_order_id: brokerOrderId,
      ts: new Date().toISOString(),
    };

    return NextResponse.json({ result });
  } catch (err: unknown) {
    console.error('[execute-trade] Error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
