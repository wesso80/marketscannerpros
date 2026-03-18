/**
 * POST /api/suggestions/[id]/accept — Accept a trade suggestion.
 *
 * Marks the suggestion as accepted and creates a journal entry
 * so the trader can track the position.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const suggestionId = parseInt(id, 10);
  if (!Number.isFinite(suggestionId)) {
    return NextResponse.json({ error: 'Invalid suggestion ID' }, { status: 400 });
  }

  // Fetch the suggestion — scoped to workspace
  const rows = await q(
    `SELECT * FROM trade_suggestions
     WHERE id = $1 AND workspace_id = $2 AND status = 'pending'`,
    [suggestionId, session.workspaceId]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Suggestion not found or already acted on' }, { status: 404 });
  }

  const suggestion = rows[0];

  // Mark as accepted
  await q(
    `UPDATE trade_suggestions SET status = 'accepted', acted_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [suggestionId, session.workspaceId]
  );

  // Create a journal entry for tracking
  const tradeDate = new Date().toISOString().split('T')[0];
  const side = suggestion.direction === 'bullish' ? 'LONG' : 'SHORT';

  const journalRows = await q(
    `INSERT INTO journal_entries
     (workspace_id, trade_date, symbol, side, entry_price, stop_loss, target,
      strategy, setup, notes, is_open, status, asset_class, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 'OPEN', $11, $12)
     RETURNING id`,
    [
      session.workspaceId,
      tradeDate,
      suggestion.symbol,
      side,
      suggestion.suggested_entry,
      suggestion.suggested_stop,
      suggestion.suggested_target,
      suggestion.strategy || 'suggestion',
      suggestion.setup || '',
      `Accepted from v4 Suggestion Engine. ${suggestion.reasoning || ''}`.trim(),
      true, // is_open
      suggestion.asset_class || null,
      JSON.stringify(['v4_suggestion']),
    ]
  );

  return NextResponse.json({
    success: true,
    suggestionId,
    journalEntryId: journalRows[0]?.id ?? null,
    message: 'Suggestion accepted — journal entry created',
  });
}
