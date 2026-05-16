import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { getKillSwitchState } from '@/lib/universe/personalUniverse';

/**
 * POST /api/journal/add-trade
 * Creates a single journal entry (manual trade).
 *
 * Kill-switch gate: when the workspace kill switch is ON, the operator
 * MUST acknowledge via body.killSwitchAck === true (with optional
 * killSwitchAckReason). Without the explicit ack we refuse the write
 * with HTTP 409 + structured error so the UI can prompt for confirmation.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();

    // Kill-switch acknowledgement gate
    try {
      const ks = await getKillSwitchState(workspaceId);
      if (ks.enabled && body.killSwitchAck !== true) {
        return NextResponse.json({
          error: 'kill_switch_active',
          requiresAck: true,
          killSwitch: {
            enabled: true,
            reason: ks.reason ?? null,
            setAt: ks.setAt ?? null,
          },
          message: 'Kill switch is ON. Acknowledge with { killSwitchAck: true, killSwitchAckReason: "..." } to override.',
        }, { status: 409 });
      }
    } catch {
      // Best-effort: if kill-switch lookup fails we do not block writes.
    }

    // Validate required fields
    const symbol = String(body.symbol || '').toUpperCase().trim();
    const side = String(body.side || '').toUpperCase();
    const entryPrice = parseFloat(body.entryPrice);
    const quantity = parseFloat(body.quantity);

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }
    if (!['LONG', 'SHORT'].includes(side)) {
      return NextResponse.json({ error: 'Side must be LONG or SHORT' }, { status: 400 });
    }
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return NextResponse.json({ error: 'Entry price must be a positive number' }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }

    const tradeType = body.tradeType || 'Spot';
    const assetClass = body.assetClass || 'equity';
    const strategy = body.strategy || null;
    const setup = body.setup || null;
    const notes = body.notes || null;
    const tradeDate = body.tradeDate || new Date().toISOString().slice(0, 10);

    // Auto-compute stop-loss & target when not provided
    let stopLoss = body.stopLoss ? parseFloat(body.stopLoss) : null;
    let target = body.target ? parseFloat(body.target) : null;
    if (!stopLoss || !Number.isFinite(stopLoss)) {
      const ac = String(assetClass).toLowerCase();
      const pct = ac === 'crypto' ? 0.05 : ac === 'forex' ? 0.015 : 0.02;
      stopLoss = side === 'LONG'
        ? +(entryPrice * (1 - pct)).toFixed(8)
        : +(entryPrice * (1 + pct)).toFixed(8);
    }
    if (!target || !Number.isFinite(target)) {
      const ac = String(assetClass).toLowerCase();
      const pct = ac === 'crypto' ? 0.10 : ac === 'forex' ? 0.030 : 0.04;
      target = side === 'LONG'
        ? +(entryPrice * (1 + pct)).toFixed(8)
        : +(entryPrice * (1 - pct)).toFixed(8);
    }

    // Options-specific fields
    const optionType = tradeType === 'Options' && body.optionType ? String(body.optionType).toUpperCase() : null;
    const strikePrice = tradeType === 'Options' && body.strikePrice ? parseFloat(body.strikePrice) : null;
    const expirationDate = tradeType === 'Options' && body.expirationDate ? body.expirationDate : null;
    const premium = tradeType === 'Options' && body.premium ? parseFloat(body.premium) : null;

    // Leverage for Futures / Margin
    const leverage = (tradeType === 'Futures' || tradeType === 'Margin') && body.leverage ? parseFloat(body.leverage) : null;

    // Calculate risk metrics if stop loss provided
    let riskAmount: number | null = null;
    let plannedRR: number | null = null;
    if (stopLoss && Number.isFinite(stopLoss)) {
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      riskAmount = riskPerUnit * quantity;
      if (target && Number.isFinite(target)) {
        const rewardPerUnit = Math.abs(target - entryPrice);
        plannedRR = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;
      }
    }

    const result = await q(
      `INSERT INTO journal_entries (
        workspace_id, trade_date, symbol, side, trade_type, asset_class,
        quantity, entry_price, stop_loss, target, risk_amount, planned_rr,
        strategy, setup, notes, outcome, tags, is_open, status,
        option_type, strike_price, expiration_date, premium, leverage
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, 'open', $16, true, 'OPEN',
        $17, $18, $19, $20, $21
      ) RETURNING id`,
      [
        workspaceId,
        tradeDate,
        symbol,
        side,
        tradeType,
        assetClass,
        quantity,
        entryPrice,
        stopLoss,
        target,
        riskAmount,
        plannedRR,
        strategy,
        setup,
        notes,
        body.tags || [],
        optionType,
        strikePrice,
        expirationDate,
        premium,
        leverage,
      ]
    );

    const newId = result?.[0]?.id;

    // ── Auto-sync to portfolio: create open position ──
    if (newId) {
      try {
        await q(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER`);
        const strategyMap: Record<string, string> = { Spot: '', Options: 'options', Futures: 'daytrade', Margin: 'daytrade' };
        await q(
          `INSERT INTO portfolio_positions (workspace_id, symbol, side, quantity, entry_price, current_price, entry_date, journal_entry_id)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
          [workspaceId, symbol, side, quantity, entryPrice, tradeDate, newId]
        );
      } catch (portfolioErr) {
        console.warn('[journal→portfolio] Non-fatal portfolio sync error:', portfolioErr instanceof Error ? portfolioErr.message : portfolioErr);
      }
    }

    return NextResponse.json({ success: true, id: newId }, { status: 201 });
  } catch (error) {
    console.error('Journal add-trade error:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}
