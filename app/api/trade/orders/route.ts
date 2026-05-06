// POST /api/trade/orders   submit a new order (paper broker only)
// GET  /api/trade/orders   list recent orders
// Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { audit } from '@/lib/trade/audit';
import { getBroker } from '@/lib/trade/oms';
import { checkRisk } from '@/lib/trade/oms/risk';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PlaceBody {
  account?: string;
  symbol?: string;
  side?: 'BUY' | 'SELL';
  qty?: number;
  type?: 'MKT' | 'LMT' | 'STP' | 'BRACKET';
  limitPrice?: number;
  stopPrice?: number;
  tpPrice?: number;
  slPrice?: number;
  estPrice?: number;
  clientOrderId?: string;
  meta?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: PlaceBody;
  try {
    body = (await req.json()) as PlaceBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const account = body.account ?? 'paper-default';
  const { symbol, side, qty, type } = body;
  if (!symbol || !side || !qty || !type) {
    return NextResponse.json({ error: 'missing symbol/side/qty/type' }, { status: 400 });
  }

  const estPrice = body.estPrice ?? body.limitPrice ?? body.stopPrice;
  if (estPrice == null) {
    return NextResponse.json({ error: 'estPrice required (or limit/stop)' }, { status: 400 });
  }

  const risk = await checkRisk({
    account,
    symbol,
    side,
    qty,
    estPrice,
    tpPrice: body.tpPrice,
    slPrice: body.slPrice,
  });
  await audit({
    category: 'risk',
    actor: `admin:${auth.cid ?? 'unknown'}`,
    action: risk.ok ? 'PASS' : 'BLOCK',
    symbol,
    payload: { request: body, result: risk },
  });
  if (!risk.ok) {
    return NextResponse.json({ error: 'risk blocked', reason: risk.reason, details: risk.details }, { status: 403 });
  }

  const broker = getBroker();
  if (broker.mode !== 'paper') {
    // Defensive: live brokers must require an explicit opt-in env flag.
    if ((process.env.TRADE_BROKER_LIVE_OPT_IN ?? 'false') !== 'true') {
      return NextResponse.json({ error: 'live broker not opted in' }, { status: 403 });
    }
  }

  try {
    const state = await broker.placeOrder({
      clientOrderId: body.clientOrderId ?? randomUUID(),
      account,
      symbol,
      side,
      qty,
      type,
      limitPrice: body.limitPrice ?? estPrice, // paper fills MKT at estPrice
      stopPrice: body.stopPrice,
      tpPrice: body.tpPrice,
      slPrice: body.slPrice,
      meta: { ...(body.meta ?? {}), submittedBy: `admin:${auth.cid ?? 'unknown'}` },
    });
    return NextResponse.json({ ok: true, order: state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'order failed' },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const symbol = new URL(req.url).searchParams.get('symbol');
  const rows = await q(
    symbol
      ? `SELECT * FROM trade_orders WHERE symbol = $1 ORDER BY created_at DESC LIMIT 100`
      : `SELECT * FROM trade_orders ORDER BY created_at DESC LIMIT 100`,
    symbol ? [symbol.toUpperCase()] : []
  );
  return NextResponse.json({ orders: rows, fetchedAt: Date.now() });
}
