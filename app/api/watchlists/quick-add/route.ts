import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/watchlists/quick-add
 *
 * One-call bridge from the research surfaces (earnings, saved cases, news) into
 * the Workspace. Finds the workspace's default watchlist (or the first one, or
 * creates a "Research Queue" list if none exists) and adds the symbol. Keeps the
 * research→workspace handoff frictionless — no watchlist-picker required.
 *
 * Body: { symbol: string; assetType?: 'equity' | 'crypto'; note?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim() : '';
    if (!rawSymbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }
    const symbol = rawSymbol.toUpperCase();
    const assetType = body?.assetType === 'crypto' ? 'crypto' : 'equity';
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;

    // Find the destination watchlist: default first, else first by sort order.
    let watchlist = await q(
      `SELECT id, name FROM watchlists
       WHERE workspace_id = $1
       ORDER BY is_default DESC, sort_order ASC, created_at ASC
       LIMIT 1`,
      [session.workspaceId],
    );

    // None yet — create a research-oriented default list.
    if (watchlist.length === 0) {
      watchlist = await q(
        `INSERT INTO watchlists (workspace_id, name, description, is_default, sort_order)
         VALUES ($1, $2, $3, true, 0)
         RETURNING id, name`,
        [session.workspaceId, 'Research Queue', 'Symbols saved from research surfaces'],
      );
    }

    const watchlistId = watchlist[0].id;

    // Enforce the same per-list tier limit as the standard add route.
    const countResult = await q(
      'SELECT COUNT(*)::int as count FROM watchlist_items WHERE watchlist_id = $1 AND workspace_id = $2',
      [watchlistId, session.workspaceId],
    );
    const currentCount = countResult[0]?.count || 0;
    const tier = session.tier || 'free';
    const limits: Record<string, number> = { free: 10, pro: 50, pro_trader: 500 };
    const maxItems = limits[tier] || 10;

    // Allow the insert through when the symbol already exists (ON CONFLICT update);
    // only block genuinely new symbols beyond the limit.
    const existing = await q(
      'SELECT 1 FROM watchlist_items WHERE watchlist_id = $1 AND symbol = $2 AND workspace_id = $3 LIMIT 1',
      [watchlistId, symbol, session.workspaceId],
    );
    if (existing.length === 0 && currentCount >= maxItems) {
      return NextResponse.json(
        { error: `Watchlist item limit reached (${maxItems}). Upgrade for more.` },
        { status: 403 },
      );
    }

    const sortResult = await q(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM watchlist_items WHERE watchlist_id = $1 AND workspace_id = $2',
      [watchlistId, session.workspaceId],
    );
    const nextOrder = sortResult[0]?.next_order || 0;

    const result = await q(
      `INSERT INTO watchlist_items (watchlist_id, workspace_id, symbol, asset_type, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (watchlist_id, symbol) DO UPDATE SET
         notes = COALESCE(EXCLUDED.notes, watchlist_items.notes)
       RETURNING *`,
      [watchlistId, session.workspaceId, symbol, assetType, note, nextOrder],
    );

    return NextResponse.json(
      {
        item: result[0],
        watchlist: { id: watchlistId, name: watchlist[0].name },
        alreadyPresent: existing.length > 0,
      },
      { status: existing.length > 0 ? 200 : 201 },
    );
  } catch (error) {
    console.error('Error in watchlist quick-add:', error);
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 });
  }
}
