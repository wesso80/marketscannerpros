import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';

/**
 * POST /api/journal/add-trade
 * Creates a single journal entry (manual trade).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();

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
    const stopLoss = body.stopLoss ? parseFloat(body.stopLoss) : null;
    const target = body.target ? parseFloat(body.target) : null;
    const notes = body.notes || null;
    const tradeDate = body.tradeDate || new Date().toISOString().slice(0, 10);

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
        strategy, setup, notes, outcome, tags, is_open, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, 'open', $16, true, 'OPEN'
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
      ]
    );

    const newId = result?.[0]?.id;

    return NextResponse.json({ success: true, id: newId }, { status: 201 });
  } catch (error) {
    console.error('Journal add-trade error:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}
