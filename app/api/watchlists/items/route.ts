import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// GET /api/watchlists/items - Get items for a specific watchlist
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const watchlistId = searchParams.get('watchlistId');

    if (!watchlistId) {
      return NextResponse.json({ error: 'Watchlist ID required' }, { status: 400 });
    }

    // Verify watchlist belongs to user
    const watchlist = await q(
      'SELECT id FROM watchlists WHERE id = $1 AND workspace_id = $2',
      [watchlistId, session.workspaceId]
    );

    if (watchlist.length === 0) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    const items = await q(`
      SELECT 
        id,
        symbol,
        asset_type,
        notes,
        added_price,
        sort_order,
        created_at
      FROM watchlist_items
      WHERE watchlist_id = $1 AND workspace_id = $2
      ORDER BY sort_order ASC, created_at ASC
    `, [watchlistId, session.workspaceId]);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching watchlist items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

// POST /api/watchlists/items - Add item to watchlist
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { watchlistId, symbol, assetType, notes, addedPrice } = body;

    if (!watchlistId || !symbol) {
      return NextResponse.json({ error: 'Watchlist ID and symbol required' }, { status: 400 });
    }

    // Verify watchlist belongs to user
    const watchlist = await q(
      'SELECT id FROM watchlists WHERE id = $1 AND workspace_id = $2',
      [watchlistId, session.workspaceId]
    );

    if (watchlist.length === 0) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    // Check item limit per watchlist (free: 10, pro: 50, pro_trader: unlimited)
    const countResult = await q(
      'SELECT COUNT(*)::int as count FROM watchlist_items WHERE watchlist_id = $1',
      [watchlistId]
    );
    const currentCount = countResult[0]?.count || 0;

    const tier = session.tier || 'free';
    const limits: Record<string, number> = { free: 10, pro: 50, pro_trader: 500 };
    const maxItems = limits[tier] || 10;

    if (currentCount >= maxItems) {
      return NextResponse.json({ 
        error: `Watchlist item limit reached (${maxItems}). Upgrade for more.` 
      }, { status: 403 });
    }

    // Get next sort order
    const sortResult = await q(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM watchlist_items WHERE watchlist_id = $1',
      [watchlistId]
    );
    const nextOrder = sortResult[0]?.next_order || 0;

    // Insert item
    const result = await q(`
      INSERT INTO watchlist_items (watchlist_id, workspace_id, symbol, asset_type, notes, added_price, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (watchlist_id, symbol) DO UPDATE SET
        notes = EXCLUDED.notes,
        added_price = COALESCE(EXCLUDED.added_price, watchlist_items.added_price)
      RETURNING *
    `, [
      watchlistId,
      session.workspaceId,
      symbol.toUpperCase().trim(),
      assetType || 'equity',
      notes?.trim() || null,
      addedPrice || null,
      nextOrder
    ]);

    return NextResponse.json({ item: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Error adding watchlist item:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}

// PUT /api/watchlists/items - Update item
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, notes, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes?.trim() || null);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(sortOrder);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    values.push(id, session.workspaceId);
    const result = await q(`
      UPDATE watchlist_items 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND workspace_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: result[0] });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/watchlists/items - Remove item from watchlist
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    const result = await q(
      'DELETE FROM watchlist_items WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [id, session.workspaceId]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
