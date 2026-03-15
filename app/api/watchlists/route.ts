import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

// GET /api/watchlists - List all watchlists with item counts
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const watchlists = await q(`
      SELECT 
        w.id,
        w.name,
        w.description,
        w.color,
        w.icon,
        w.is_default,
        w.sort_order,
        w.created_at,
        w.updated_at,
        COUNT(wi.id)::int as item_count
      FROM watchlists w
      LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
      WHERE w.workspace_id = $1
      GROUP BY w.id
      ORDER BY w.sort_order ASC, w.created_at ASC
    `, [session.workspaceId]);

    return NextResponse.json({ watchlists });
  } catch (error: any) {
    // If table doesn't exist yet, auto-create and return empty
    if (error?.message?.includes('does not exist') || error?.code === '42P01') {
      console.log('[Watchlists] Tables missing, auto-creating...');
      try {
        await q(`
          CREATE TABLE IF NOT EXISTS watchlists (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL,
            name VARCHAR(50) NOT NULL,
            description VARCHAR(200),
            color VARCHAR(20) DEFAULT 'emerald',
            icon VARCHAR(20) DEFAULT 'star',
            is_default BOOLEAN NOT NULL DEFAULT false,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await q(`
          CREATE TABLE IF NOT EXISTS watchlist_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            asset_type VARCHAR(20) NOT NULL DEFAULT 'equity',
            notes VARCHAR(200),
            added_price DECIMAL(20, 8),
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(watchlist_id, symbol)
          )
        `);
        await q('CREATE INDEX IF NOT EXISTS idx_watchlists_workspace ON watchlists(workspace_id)');
        await q('CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id)');
        await q('CREATE INDEX IF NOT EXISTS idx_watchlist_items_workspace ON watchlist_items(workspace_id)');
        return NextResponse.json({ watchlists: [] });
      } catch (createErr) {
        console.error('Error auto-creating watchlist tables:', createErr);
      }
    }
    console.error('Error fetching watchlists:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlists' }, { status: 500 });
  }
}

// POST /api/watchlists - Create new watchlist
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, color, icon } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (name.length > 50) {
      return NextResponse.json({ error: 'Name too long (max 50 chars)' }, { status: 400 });
    }

    // Check watchlist limit (free: 3, pro: 10, pro_trader: unlimited)
    const countResult = await q(
      'SELECT COUNT(*)::int as count FROM watchlists WHERE workspace_id = $1',
      [session.workspaceId]
    );
    const currentCount = countResult[0]?.count || 0;

    // Get user tier
    const tier = session.tier || 'free';
    const limits: Record<string, number> = { free: 3, pro: 10, pro_trader: 100 };
    const maxWatchlists = limits[tier] || 3;

    if (currentCount >= maxWatchlists) {
      return NextResponse.json({ 
        error: `Watchlist limit reached (${maxWatchlists}). Upgrade for more.` 
      }, { status: 403 });
    }

    // Get next sort order
    const sortResult = await q(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM watchlists WHERE workspace_id = $1',
      [session.workspaceId]
    );
    const nextOrder = sortResult[0]?.next_order || 0;

    // Create watchlist
    const result = await q(`
      INSERT INTO watchlists (workspace_id, name, description, color, icon, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      session.workspaceId,
      name.trim(),
      description?.trim() || null,
      color || 'emerald',
      icon || 'star',
      nextOrder
    ]);

    return NextResponse.json({ watchlist: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating watchlist:', error);
    return NextResponse.json({ error: 'Failed to create watchlist' }, { status: 500 });
  }
}

// PUT /api/watchlists - Update watchlist
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, description, color, icon, is_default } = body;

    if (!id) {
      return NextResponse.json({ error: 'Watchlist ID required' }, { status: 400 });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description?.trim() || null);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (is_default !== undefined) {
      // If setting as default, unset others first
      if (is_default) {
        await q(
          'UPDATE watchlists SET is_default = false WHERE workspace_id = $1',
          [session.workspaceId]
        );
      }
      updates.push(`is_default = $${paramIndex++}`);
      values.push(is_default);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    values.push(id, session.workspaceId);
    const result = await q(`
      UPDATE watchlists 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND workspace_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    return NextResponse.json({ watchlist: result[0] });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}

// DELETE /api/watchlists - Delete watchlist
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Watchlist ID required' }, { status: 400 });
    }

    const result = await q(
      'DELETE FROM watchlists WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [id, session.workspaceId]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting watchlist:', error);
    return NextResponse.json({ error: 'Failed to delete watchlist' }, { status: 500 });
  }
}
