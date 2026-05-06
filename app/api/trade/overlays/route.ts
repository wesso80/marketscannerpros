// GET  /api/trade/overlays?symbol=ES.c.0     → active overlays for chart rendering
// Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface OverlayRow {
  id: string;
  source: string;
  symbol: string;
  direction: number;
  entry: string;
  tp1: string | null;
  tp2: string | null;
  sl: string | null;
  opened_at: string;
  meta: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const symbol = new URL(req.url).searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const rows = await q<OverlayRow>(
    `SELECT id, source, symbol, direction, entry, tp1, tp2, sl, opened_at, meta
       FROM trade_overlays
      WHERE symbol = $1 AND closed_at IS NULL
      ORDER BY opened_at DESC`,
    [symbol.toUpperCase()]
  );

  return NextResponse.json({
    overlays: rows.map((r) => ({
      id: r.id,
      source: r.source,
      symbol: r.symbol,
      direction: r.direction,
      entry: Number(r.entry),
      tp1: r.tp1 == null ? null : Number(r.tp1),
      tp2: r.tp2 == null ? null : Number(r.tp2),
      sl: r.sl == null ? null : Number(r.sl),
      openedAt: r.opened_at,
      meta: r.meta,
    })),
    fetchedAt: Date.now(),
  });
}
