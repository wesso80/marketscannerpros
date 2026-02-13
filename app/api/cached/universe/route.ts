/**
 * Symbol Universe Management API
 * View and manage which symbols are tracked by the worker
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

// GET: List all tracked symbols
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get('asset_type'); // equity, crypto, forex
  const tier = searchParams.get('tier'); // 1, 2, 3
  const enabled = searchParams.get('enabled'); // true, false

  try {
    let query = 'SELECT * FROM symbol_universe WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (assetType) {
      query += ` AND asset_type = $${paramIndex++}`;
      params.push(assetType);
    }

    if (tier) {
      query += ` AND tier = $${paramIndex++}`;
      params.push(parseInt(tier, 10));
    }

    if (enabled !== null && enabled !== undefined) {
      query += ` AND enabled = $${paramIndex++}`;
      params.push(enabled === 'true');
    }

    query += ' ORDER BY tier ASC, symbol ASC';

    const rows = await q<any>(query, params);

    return NextResponse.json({
      symbols: rows,
      total: rows.length,
    });

  } catch (err: any) {
    console.error('[api/cached/universe] DB error:', err?.message || err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST: Add symbols to universe
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbols } = body;

    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 });
    }

    const added: string[] = [];
    const errors: string[] = [];

    for (const item of symbols) {
      const symbol = typeof item === 'string' ? item : item.symbol;
      const assetType = typeof item === 'object' ? item.asset_type || 'equity' : 'equity';
      const name = typeof item === 'object' ? item.name || null : null;
      const tier = typeof item === 'object' ? item.tier || 2 : 2;

      if (!symbol || typeof symbol !== 'string') {
        errors.push(`Invalid symbol: ${JSON.stringify(item)}`);
        continue;
      }

      try {
        await q(`
          INSERT INTO symbol_universe (symbol, asset_type, name, tier, enabled)
          VALUES ($1, $2, $3, $4, TRUE)
          ON CONFLICT (symbol) DO UPDATE SET
            asset_type = EXCLUDED.asset_type,
            name = COALESCE(EXCLUDED.name, symbol_universe.name),
            tier = EXCLUDED.tier,
            enabled = TRUE,
            updated_at = NOW()
        `, [symbol.toUpperCase(), assetType, name, tier]);

        added.push(symbol.toUpperCase());
      } catch (err: any) {
        errors.push(`${symbol}: ${err?.message || 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      added,
      errors,
      total_added: added.length,
    });

  } catch (err: any) {
    console.error('[api/cached/universe] POST error:', err?.message || err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// DELETE: Remove or disable symbols
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbols, hard_delete = false } = body;

    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 });
    }

    const symbolList = symbols
      .map(s => (typeof s === 'string' ? s : s.symbol).toUpperCase())
      .filter(Boolean);

    if (symbolList.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    const placeholders = symbolList.map((_, i) => `$${i + 1}`).join(',');

    if (hard_delete) {
      // Actually delete the rows
      await q(`DELETE FROM symbol_universe WHERE symbol IN (${placeholders})`, symbolList);
    } else {
      // Soft disable
      await q(`
        UPDATE symbol_universe 
        SET enabled = FALSE, updated_at = NOW()
        WHERE symbol IN (${placeholders})
      `, symbolList);
    }

    return NextResponse.json({
      action: hard_delete ? 'deleted' : 'disabled',
      symbols: symbolList,
    });

  } catch (err: any) {
    console.error('[api/cached/universe] DELETE error:', err?.message || err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
