import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { resolveEntryLevels } from '@/lib/journal/entryLevels';
import { validateTradeEdit } from '@/lib/journal/tradeEdit';

/**
 * PATCH /api/journal/trade/:id (TR-28)
 * Edit an OPEN trade's stop and/or target (risk amount and planned R:R are recomputed from them, exactly as
 * add-trade does), or append a dated note to any trade. Uses existing columns only; closed trades keep the
 * levels their stored R was computed from.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = await context.params;
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid journal trade id' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const rows = await q<{
      side: string; entry_price: string | number; quantity: string | number; asset_class: string | null;
      is_open: boolean; stop_loss: string | number | null; target: string | number | null; notes: string | null;
    }>(
      `SELECT side, entry_price, quantity, asset_class, is_open, stop_loss, target, notes
         FROM journal_entries WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
      [session.workspaceId, id],
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const checked = validateTradeEdit(
      {
        side: String(row.side || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
        entryPrice: Number(row.entry_price),
        isOpen: row.is_open === true,
        stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
        target: row.target == null ? null : Number(row.target),
        notes: row.notes ?? '',
      },
      body,
    );
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

    let levels: ReturnType<typeof resolveEntryLevels> | null = null;
    if (checked.levelsChanged) {
      levels = resolveEntryLevels({
        side: checked.side,
        entryPrice: Number(row.entry_price),
        quantity: Number(row.quantity),
        assetClass: row.asset_class || 'equity',
        stopLoss: checked.stopLoss ?? undefined,
        target: checked.target ?? undefined,
      });
      await q(
        `UPDATE journal_entries SET stop_loss = $3, target = $4, risk_amount = $5, planned_rr = $6
          WHERE workspace_id = $1 AND id = $2 AND is_open = true`,
        [session.workspaceId, id, levels.stopLoss, levels.target, levels.riskAmount, levels.plannedRR],
      );
    }
    if (checked.notesChanged) {
      await q(`UPDATE journal_entries SET notes = $3 WHERE workspace_id = $1 AND id = $2`, [session.workspaceId, id, checked.notes]);
    }

    return NextResponse.json({ ok: true, id, ...(levels ? { stopLoss: levels.stopLoss, target: levels.target, riskAmount: levels.riskAmount, plannedRR: levels.plannedRR } : {}), ...(checked.notesChanged ? { notes: checked.notes } : {}) });
  } catch (error) {
    console.error('Journal trade PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}
