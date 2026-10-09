import { assertJournalQuota, JournalQuotaError, journalQuotaResponse } from '@/lib/free/journalQuota';
import { getEffectiveTier } from '@/lib/entitlements';
import { isPaidTier } from '@/lib/tiers';
import { NextRequest, NextResponse } from 'next/server';
import { q, atomicQueries } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth';
import { resolveEntryLevels } from '@/lib/journal/entryLevels';

/** Tags must be a short list of strings (a bare string would break the TEXT[] insert). */
function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const tag = typeof t === 'string' ? t.trim().slice(0, 32) : '';
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * POST /api/journal/add-trade
 * Creates a single journal entry (manual trade).
 *
 * The admin kill switch does not gate Journal writes: it is an admin control and must not stop anyone using their
 * Journal (owner decision, admin audit M6).
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
    const notes = body.notes || null;
    const tradeDate = body.tradeDate || new Date().toISOString().slice(0, 10);

    // TR-9: a blank stop or target stays blank (nothing invented); risk only from an entered stop,
    // planned R:R only from an entered stop and target.
    const { stopLoss, target, riskAmount, plannedRR } = resolveEntryLevels({
      side: side as 'LONG' | 'SHORT',
      entryPrice,
      quantity,
      assetClass,
      stopLoss: body.stopLoss,
      target: body.target,
    });

    // Options-specific fields
    const optionType = tradeType === 'Options' && body.optionType ? String(body.optionType).toUpperCase() : null;
    const strikePrice = tradeType === 'Options' && body.strikePrice ? parseFloat(body.strikePrice) : null;
    const expirationDate = tradeType === 'Options' && body.expirationDate ? body.expirationDate : null;
    const premium = tradeType === 'Options' && body.premium ? parseFloat(body.premium) : null;

    // Leverage for Futures / Margin
    const leverage = (tradeType === 'Futures' || tradeType === 'Margin') && body.leverage ? parseFloat(body.leverage) : null;

    const paid = isPaidTier(await getEffectiveTier(workspaceId, session.tier, session.cid, q));
    const insert = async () => q(
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
        sanitizeTags(body.tags),
        optionType,
        strikePrice,
        expirationDate,
        premium,
        leverage,
      ]
    );

    const result = paid ? await insert() : await atomicQueries(async () => {
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`journal-quota:${workspaceId}`]);
      const counts = await q<{ count: string }>('SELECT COUNT(*)::text AS count FROM journal_entries WHERE workspace_id = $1 AND is_open = true', [workspaceId]);
      assertJournalQuota(Number(counts[0]?.count ?? 0) + 1);
      return insert();
    });
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
    if (error instanceof JournalQuotaError) return NextResponse.json(journalQuotaResponse(), { status: 403 });
    console.error('Journal add-trade error:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}
